import { setAudioSession } from '@/lib/voice/audioSession'

/** The longest memo: at 10:00 the composer stops and shows the preview. */
export const MAX_RECORDING_MS = 10 * 60_000
/** From here the timer turns red and counts down. */
export const WARN_AT_MS = MAX_RECORDING_MS - 30_000
/** Waveform bars stored with each memo. */
export const PEAK_COUNT = 48
/** How often the input level is sampled (live bars and peaks). */
const LEVEL_INTERVAL_MS = 50

export interface VoiceFormat {
  mimeType: string
  ext: 'm4a' | 'webm'
  bitsPerSecond: number
}

const FORMATS: VoiceFormat[] = [
  { mimeType: 'audio/mp4;codecs=mp4a.40.2', ext: 'm4a', bitsPerSecond: 128_000 },
  { mimeType: 'audio/mp4', ext: 'm4a', bitsPerSecond: 128_000 },
  { mimeType: 'audio/webm;codecs=opus', ext: 'webm', bitsPerSecond: 96_000 },
  { mimeType: 'audio/webm', ext: 'webm', bitsPerSecond: 96_000 },
]

/** The first format this browser records: AAC (plays everywhere) before Opus (Firefox). */
export function pickFormat(isTypeSupported: (type: string) => boolean): VoiceFormat | null {
  return FORMATS.find((f) => isTypeSupported(f.mimeType)) ?? null
}

/** Whether this browser can record a memo at all (the mic button shows only then). */
export function canRecordVoice(): boolean {
  if (typeof MediaRecorder === 'undefined' || typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return false
  return pickFormat((t) => MediaRecorder.isTypeSupported(t)) !== null
}

/** Levels (0–1, one per sample) down to `n` bars of 0–100: the loudest sample per slice, scaled so the loudest bar is 100. */
export function toPeaks(levels: number[], n = PEAK_COUNT): number[] {
  if (levels.length === 0) return Array(n).fill(0)
  const bars: number[] = []
  for (let i = 0; i < n; i++) {
    const from = Math.floor((i * levels.length) / n)
    const to = Math.max(from + 1, Math.floor(((i + 1) * levels.length) / n))
    let max = 0
    for (let j = from; j < to && j < levels.length; j++) max = Math.max(max, levels[j])
    bars.push(max)
  }
  const top = Math.max(...bars)
  return bars.map((v) => (top > 0 ? Math.round((v / top) * 100) : 0))
}

export type VoiceErrorKind = 'denied' | 'unavailable' | 'failed'

export class VoiceError extends Error {
  constructor(readonly kind: VoiceErrorKind) {
    super(`voice recording ${kind}`)
    this.name = 'VoiceError'
  }
}

export interface VoiceRecording {
  /** Typed without codecs ("audio/mp4", "audio/webm"), as upload-media expects. */
  blob: Blob
  format: VoiceFormat
  durationMs: number
  /** PEAK_COUNT values, 0–100. */
  peaks: number[]
}

export interface Recorder {
  /** ms since recording started, at most MAX_RECORDING_MS. */
  elapsedMs(): number
  /** Stops and returns the memo. The microphone is released at once. Calling it again returns the same memo. */
  stop(): Promise<VoiceRecording>
  /** Stops and throws everything away; the microphone is released at once. Safe to call again. */
  discard(): void
}

export interface RecorderOptions {
  /** Each level sample, 0–1 (the live bars). */
  onLevel?: (level: number) => void
  /** MAX_RECORDING_MS reached: the owner calls stop() and shows the preview. */
  onLimit?: () => void
  /** The recorder failed mid-recording: the owner discards. */
  onError?: () => void
}

/** The browser pieces the recorder uses, so tests can pass fakes. */
export interface RecorderEnv {
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>
  MediaRecorder: typeof MediaRecorder
  AudioContext: typeof AudioContext | undefined
  now: () => number
}

function browserEnv(): RecorderEnv {
  const w = window as Window & { webkitAudioContext?: typeof AudioContext }
  return {
    getUserMedia: (c) => navigator.mediaDevices.getUserMedia(c),
    MediaRecorder,
    AudioContext: window.AudioContext ?? w.webkitAudioContext,
    now: () => performance.now(),
  }
}

function errorKind(e: unknown): VoiceErrorKind {
  const name = (e as { name?: string } | null)?.name
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'unavailable'
  return 'failed'
}

/**
 * Asks for the microphone and starts recording. Call it from the press itself: the AudioContext is
 * created before the permission prompt, while the gesture still counts (iOS starts it suspended otherwise).
 * Rejects with a VoiceError.
 */
export async function startRecording(opts: RecorderOptions = {}, env: RecorderEnv = browserEnv()): Promise<Recorder> {
  const format = pickFormat((t) => env.MediaRecorder.isTypeSupported(t))
  if (!format) throw new VoiceError('unavailable')

  let ctx: AudioContext | null = null
  try {
    ctx = env.AudioContext ? new env.AudioContext() : null
    void ctx?.resume().catch(() => {})
  } catch {
    ctx = null
  }
  const closeCtx = () => {
    void ctx?.close().catch(() => {})
    ctx = null
  }

  setAudioSession('play-and-record')
  let stream: MediaStream
  try {
    stream = await env.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
  } catch (e) {
    closeCtx()
    setAudioSession('auto')
    throw new VoiceError(errorKind(e))
  }

  const levels: number[] = []
  let sampler: ReturnType<typeof setInterval> | null = null
  if (ctx) {
    try {
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 1024
      ctx.createMediaStreamSource(stream).connect(analyser)
      const buf = new Float32Array(1024)
      sampler = setInterval(() => {
        analyser.getFloatTimeDomainData(buf)
        let sum = 0
        for (const v of buf) sum += v * v
        // RMS of speech sits around 0.05–0.25; ×4 spreads it over the bar heights.
        const level = Math.min(1, Math.sqrt(sum / buf.length) * 4)
        levels.push(level)
        opts.onLevel?.(level)
      }, LEVEL_INTERVAL_MS)
    } catch {
      closeCtx()
    }
  }

  const chunks: Blob[] = []
  let mr: MediaRecorder
  try {
    mr = new env.MediaRecorder(stream, { mimeType: format.mimeType, audioBitsPerSecond: format.bitsPerSecond })
  } catch {
    if (sampler) clearInterval(sampler)
    stream.getTracks().forEach((t) => t.stop())
    closeCtx()
    setAudioSession('auto')
    throw new VoiceError('failed')
  }
  mr.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data)
  }
  mr.onerror = () => opts.onError?.()
  mr.start(1000)
  const startedAt = env.now()
  const limit = setTimeout(() => opts.onLimit?.(), MAX_RECORDING_MS)

  let finished = false
  let result: Promise<VoiceRecording> | null = null
  const release = () => {
    if (sampler) clearInterval(sampler)
    sampler = null
    clearTimeout(limit)
    stream.getTracks().forEach((t) => t.stop())
    closeCtx()
    setAudioSession('auto')
  }
  const elapsedMs = () => Math.min(MAX_RECORDING_MS, Math.max(0, env.now() - startedAt))

  return {
    elapsedMs,
    stop() {
      if (result) return result
      if (finished) return Promise.reject(new VoiceError('failed'))
      finished = true
      const durationMs = Math.round(elapsedMs())
      result = new Promise<VoiceRecording>((resolve, reject) => {
        mr.onstop = () => {
          const type = format.mimeType.split(';')[0]
          resolve({ blob: new Blob(chunks, { type }), format, durationMs, peaks: toPeaks(levels) })
        }
        try {
          mr.stop()
        } catch {
          reject(new VoiceError('failed'))
        }
      })
      release()
      return result
    },
    discard() {
      if (finished) return
      finished = true
      mr.onstop = null
      mr.ondataavailable = null
      try {
        if (mr.state !== 'inactive') mr.stop()
      } catch {
        // Already stopped.
      }
      chunks.length = 0
      release()
    },
  }
}
