import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_RECORDING_MS,
  PEAK_COUNT,
  VoiceError,
  pickFormat,
  startRecording,
  toPeaks,
  type RecorderEnv,
} from '@/lib/voice/recorder'

const setAudioSession = vi.hoisted(() => vi.fn())
vi.mock('@/lib/voice/audioSession', () => ({ setAudioSession }))

const ALL = new Set(['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'])

class FakeRecorder {
  static supported = ALL
  static isTypeSupported = (t: string) => FakeRecorder.supported.has(t)
  static last: FakeRecorder | null = null
  state: 'inactive' | 'recording' = 'inactive'
  ondataavailable: ((e: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(
    readonly stream: unknown,
    readonly options: { mimeType: string; audioBitsPerSecond: number },
  ) {
    FakeRecorder.last = this
  }
  start() {
    this.state = 'recording'
  }
  stop() {
    this.state = 'inactive'
    this.ondataavailable?.({ data: new Blob(['abc']) })
    this.onstop?.()
  }
}

let level = 0.25
class FakeAudioContext {
  static last: FakeAudioContext | null = null
  close = vi.fn(async () => {})
  resume = vi.fn(async () => {})
  constructor() {
    FakeAudioContext.last = this
  }
  createAnalyser() {
    return {
      fftSize: 0,
      getFloatTimeDomainData: (buf: Float32Array) => buf.fill(level),
    }
  }
  createMediaStreamSource() {
    return { connect: () => {} }
  }
}

let clock = 0
let track: { stop: ReturnType<typeof vi.fn> }
function env(overrides: Partial<RecorderEnv> = {}): RecorderEnv {
  track = { stop: vi.fn() }
  return {
    getUserMedia: vi.fn(async () => ({ getTracks: () => [track] }) as unknown as MediaStream),
    MediaRecorder: FakeRecorder as unknown as typeof MediaRecorder,
    AudioContext: FakeAudioContext as unknown as typeof AudioContext,
    now: () => clock,
    ...overrides,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  clock = 0
  level = 0.25
  FakeRecorder.supported = ALL
})
afterEach(() => vi.useRealTimers())

describe('pickFormat', () => {
  it('prefers AAC in MP4, then MP4, then Opus in WebM, then WebM', () => {
    expect(pickFormat((t) => ALL.has(t))).toEqual({ mimeType: 'audio/mp4;codecs=mp4a.40.2', ext: 'm4a', bitsPerSecond: 128_000 })
    expect(pickFormat((t) => t === 'audio/mp4' || t === 'audio/webm')).toEqual({ mimeType: 'audio/mp4', ext: 'm4a', bitsPerSecond: 128_000 })
    expect(pickFormat((t) => t.startsWith('audio/webm'))).toEqual({ mimeType: 'audio/webm;codecs=opus', ext: 'webm', bitsPerSecond: 96_000 })
    expect(pickFormat((t) => t === 'audio/webm')).toEqual({ mimeType: 'audio/webm', ext: 'webm', bitsPerSecond: 96_000 })
    expect(pickFormat(() => false)).toBeNull()
  })
})

describe('toPeaks', () => {
  it('gives 48 bars of 0–100 with the loudest at 100', () => {
    const peaks = toPeaks(Array.from({ length: 500 }, (_, i) => (i % 50) / 100))
    expect(peaks).toHaveLength(PEAK_COUNT)
    expect(Math.max(...peaks)).toBe(100)
    expect(peaks.every((p) => Number.isInteger(p) && p >= 0 && p <= 100)).toBe(true)
  })

  it('stretches short recordings and keeps silence at 0', () => {
    expect(toPeaks([0.5, 1])).toHaveLength(PEAK_COUNT)
    expect(toPeaks([])).toEqual(Array(PEAK_COUNT).fill(0))
    expect(toPeaks([0, 0, 0])).toEqual(Array(PEAK_COUNT).fill(0))
  })
})

describe('startRecording', () => {
  it('records with the chosen type and bitrate, and stop() returns the memo', async () => {
    const e = env()
    const rec = await startRecording({}, e)
    expect(FakeRecorder.last?.options).toEqual({ mimeType: 'audio/mp4;codecs=mp4a.40.2', audioBitsPerSecond: 128_000 })
    expect(setAudioSession).toHaveBeenCalledWith('play-and-record')
    vi.advanceTimersByTime(1000)
    clock = 4200
    const memo = await rec.stop()
    expect(memo.blob.type).toBe('audio/mp4')
    expect(memo.format.ext).toBe('m4a')
    expect(memo.durationMs).toBe(4200)
    expect(memo.peaks).toHaveLength(PEAK_COUNT)
    expect(track.stop).toHaveBeenCalled()
    expect(FakeAudioContext.last?.close).toHaveBeenCalled()
    expect(setAudioSession).toHaveBeenLastCalledWith('auto')
  })

  it('reports levels while recording', async () => {
    const onLevel = vi.fn()
    await startRecording({ onLevel }, env())
    vi.advanceTimersByTime(200)
    expect(onLevel).toHaveBeenCalled()
    expect(onLevel.mock.calls[0][0]).toBeGreaterThan(0)
    expect(onLevel.mock.calls[0][0]).toBeLessThanOrEqual(1)
  })

  it('discard() releases the microphone, and a later stop() rejects', async () => {
    const rec = await startRecording({}, env())
    rec.discard()
    rec.discard()
    expect(track.stop).toHaveBeenCalledTimes(1)
    expect(FakeRecorder.last?.state).toBe('inactive')
    await expect(rec.stop()).rejects.toBeInstanceOf(VoiceError)
  })

  it('calls onLimit at 10:00 and caps the length there', async () => {
    const onLimit = vi.fn()
    const rec = await startRecording({ onLimit }, env())
    clock = MAX_RECORDING_MS + 500
    vi.advanceTimersByTime(MAX_RECORDING_MS)
    expect(onLimit).toHaveBeenCalledTimes(1)
    expect(rec.elapsedMs()).toBe(MAX_RECORDING_MS)
    expect((await rec.stop()).durationMs).toBe(MAX_RECORDING_MS)
  })

  it('passes recorder errors on', async () => {
    const onError = vi.fn()
    await startRecording({ onError }, env())
    FakeRecorder.last?.onerror?.()
    expect(onError).toHaveBeenCalled()
  })

  it('maps getUserMedia failures to denied / unavailable / failed and closes the audio context', async () => {
    const fail = (name: string) => env({ getUserMedia: vi.fn(async () => Promise.reject(Object.assign(new Error(name), { name }))) })
    await expect(startRecording({}, fail('NotAllowedError'))).rejects.toMatchObject({ kind: 'denied' })
    expect(FakeAudioContext.last?.close).toHaveBeenCalled()
    await expect(startRecording({}, fail('NotFoundError'))).rejects.toMatchObject({ kind: 'unavailable' })
    await expect(startRecording({}, fail('AbortError'))).rejects.toMatchObject({ kind: 'failed' })
    expect(setAudioSession).toHaveBeenLastCalledWith('auto')
  })

  it('is unavailable when no type is supported', async () => {
    FakeRecorder.supported = new Set()
    await expect(startRecording({}, env())).rejects.toMatchObject({ kind: 'unavailable' })
  })

  it('still records (flat waveform) without an AudioContext', async () => {
    const rec = await startRecording({}, env({ AudioContext: undefined }))
    clock = 1000
    expect((await rec.stop()).peaks).toEqual(Array(PEAK_COUNT).fill(0))
  })
})
