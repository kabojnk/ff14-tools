import { useEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import { onAppStateChange } from '@/lib/appLifecycle'
import { discardUnsentVoice, sendVoiceMemo } from '@/lib/chat/voice'
import { isNativeApp } from '@/lib/platform'
import { IDLE, SHORT_TAP_MS, step, type GestureAction, type GestureEvent } from '@/lib/voice/gesture'
import { VoiceError, startRecording, type Recorder, type VoiceRecording } from '@/lib/voice/recorder'
import { useAuthStore } from '@/stores/authStore'
import { useUiStore } from '@/stores/uiStore'
import { useVoicePlayerStore } from '@/stores/voicePlayer'
import type { Message, Space, TypingActivity } from '@/types'

export type VoicePhase = 'idle' | 'holding' | 'locked' | 'preview'
/** The player id of the composer's preview. */
export const PREVIEW_ID = 'voice-preview'
/** Live level samples kept for the recording row's bars. */
const LIVE_LEVELS = 64
const TICK_MS = 200
const HINT_MS = 2500

export interface VoiceSession {
  phase: VoicePhase
  elapsedMs: number
  /** Recent input levels (0–1), oldest first. */
  levels: number[]
  /** While holding: how far the finger has slid left (dx) and up (dy), both ≤ 0. */
  drag: { dx: number; dy: number }
  preview: { recording: VoiceRecording; url: string } | null
  /** A short message over the composer ("Hold to record", microphone problems). */
  hint: string | null
  /** For the mic / Send button. */
  press: {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => void
    onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => void
    onClick: (e: ReactMouseEvent<HTMLElement>) => void
  }
  stopToPreview: () => void
  send: () => void
  discard: () => void
}

interface Options {
  conversationId: string
  space: Space
  replyTo: Message | null
  /** A memo went out (the composer clears the reply). */
  onSent: () => void
  sendTyping: (activity?: TypingActivity) => void
  stopTyping: () => void
}

function errorHint(e: unknown): string {
  const kind = e instanceof VoiceError ? e.kind : 'failed'
  if (kind === 'denied') {
    return isNativeApp()
      ? 'Microphone access is off. Turn it on in Settings → XIV.'
      : "Microphone access is off. Allow it in the browser's settings for this site."
  }
  if (kind === 'unavailable') return 'No microphone found.'
  return "Couldn't start recording."
}

const vibrate = () => {
  if ('vibrate' in navigator) navigator.vibrate(10)
}

/**
 * The composer's voice memo: hold to record (release sends, slide left cancels, slide up locks),
 * a mouse or keyboard press records locked, Stop shows the preview, and the 10-minute limit does too.
 * The disguise, the PIN lock, the background, a space change and unmounting all discard, releasing the
 * microphone at once.
 */
export function useVoiceSession(options: Options): VoiceSession {
  const [phase, setPhaseState] = useState<VoicePhase>('idle')
  const [elapsedMs, setElapsed] = useState(0)
  const [levels, setLevels] = useState<number[]>([])
  const [drag, setDrag] = useState({ dx: 0, dy: 0 })
  const [preview, setPreviewState] = useState<VoiceSession['preview']>(null)
  const [hint, setHint] = useState<string | null>(null)

  const opts = useRef(options)
  opts.current = options
  const phaseRef = useRef<VoicePhase>('idle')
  const previewRef = useRef<VoiceSession['preview']>(null)
  const gestureRef = useRef(IDLE)
  /** Bumped by every reset: a recorder that starts after its session was discarded is thrown away. */
  const genRef = useRef(0)
  const startRef = useRef<Promise<Recorder | null> | null>(null)
  const recorderRef = useRef<Recorder | null>(null)
  /** A stop is under way: a new press waits until it has finished. */
  const stoppingRef = useRef(false)
  /** The phase a press began in: the click at the end of a hold-then-lock is not a Send. */
  const pressPhaseRef = useRef<VoicePhase>('idle')

  const setPhase = (p: VoicePhase) => {
    phaseRef.current = p
    setPhaseState(p)
  }
  const setPreview = (p: VoiceSession['preview']) => {
    previewRef.current = p
    setPreviewState(p)
  }

  /** Back to idle, keeping nothing. Safe to call at any time. */
  const reset = () => {
    genRef.current++
    gestureRef.current = IDLE
    recorderRef.current?.discard()
    recorderRef.current = null
    void startRef.current?.then((r) => r?.discard())
    startRef.current = null
    const p = previewRef.current
    if (p) {
      useVoicePlayerStore.getState().stop(PREVIEW_ID)
      URL.revokeObjectURL(p.url)
    }
    setPreview(null)
    if (phaseRef.current !== 'idle') opts.current.stopTyping()
    setPhase('idle')
    setElapsed(0)
    setLevels([])
    setDrag({ dx: 0, dy: 0 })
  }

  const begin = (locked: boolean) => {
    if (phaseRef.current !== 'idle' || stoppingRef.current) return
    const gen = ++genRef.current
    setPhase(locked ? 'locked' : 'holding')
    setElapsed(0)
    setLevels([])
    setDrag({ dx: 0, dy: 0 })
    vibrate()
    startRef.current = startRecording({
      onLevel: (level) => setLevels((prev) => [...prev.slice(-(LIVE_LEVELS - 1)), level]),
      onLimit: () => void actions.current.toPreview(),
      onError: () => {
        actions.current.reset()
        setHint('Recording stopped')
      },
    }).then(
      (r) => {
        if (genRef.current !== gen) {
          r.discard()
          return null
        }
        recorderRef.current = r
        return r
      },
      (e: unknown) => {
        if (genRef.current === gen) {
          actions.current.reset()
          setHint(errorHint(e))
        }
        return null
      },
    )
  }

  /** Stops the recorder and returns the memo, or null if it was discarded, failed, or never started. */
  const stopRecorder = async (): Promise<VoiceRecording | null> => {
    const pending = startRef.current
    stoppingRef.current = true
    try {
      const r = await pending
      if (!r) return null
      return await r.stop()
    } catch {
      return null
    } finally {
      stoppingRef.current = false
    }
  }

  const sendRecording = (recording: VoiceRecording) => {
    const authorId = useAuthStore.getState().user?.id
    const o = opts.current
    if (!authorId) return
    void sendVoiceMemo({ authorId, conversationId: o.conversationId, space: o.space, recording, replyTo: o.replyTo?.id ?? null })
    o.onSent()
  }

  /** Release after a hold, or Send while locked: stop, then send (too short: a hint instead). */
  const finishAndSend = async () => {
    const gen = genRef.current
    setPhase('idle')
    opts.current.stopTyping()
    const recording = await stopRecorder()
    if (genRef.current !== gen) return
    reset()
    if (!recording) return
    if (recording.durationMs < SHORT_TAP_MS) {
      setHint('Hold to record')
      return
    }
    sendRecording(recording)
  }

  const toPreview = async () => {
    // Stop pressed just as the limit hit: one preview, not two.
    if (stoppingRef.current || (phaseRef.current !== 'holding' && phaseRef.current !== 'locked')) return
    // A finger still down: its release does nothing now.
    gestureRef.current = IDLE
    const gen = genRef.current
    opts.current.stopTyping()
    const recording = await stopRecorder()
    if (genRef.current !== gen) return
    startRef.current = null
    recorderRef.current = null
    if (!recording) {
      reset()
      setHint('Recording stopped')
      return
    }
    setPreview({ recording, url: URL.createObjectURL(recording.blob) })
    setPhase('preview')
  }

  const send = () => {
    if (stoppingRef.current) return
    if (phaseRef.current === 'preview') {
      const p = previewRef.current
      if (!p) return
      reset()
      sendRecording(p.recording)
      return
    }
    if (phaseRef.current === 'locked') void finishAndSend()
  }

  const run = (action: GestureAction) => {
    if (action === 'start') begin(false)
    else if (action === 'start-locked') begin(true)
    else if (action === 'lock') {
      if (phaseRef.current === 'holding') {
        setPhase('locked')
        vibrate()
      }
    } else if (action === 'cancel') reset()
    else if (action === 'short-tap') {
      reset()
      setHint('Hold to record')
    } else if (action === 'send') {
      if (phaseRef.current === 'holding') void finishAndSend()
    }
  }

  const feed = (ev: GestureEvent) => {
    const { state, action } = step(gestureRef.current, ev)
    gestureRef.current = state
    if (state.mode === 'holding') setDrag({ dx: state.dx, dy: state.dy })
    run(action)
  }

  // Effects and the recorder's callbacks call through here, so they always reach this render's functions.
  const actions = useRef({ reset, toPreview })
  actions.current = { reset, toPreview }

  useEffect(() => {
    if (!hint) return
    const t = setTimeout(() => setHint(null), HINT_MS)
    return () => clearTimeout(t)
  }, [hint])

  // The timer, and "recording" for the other person (useTyping throttles it to every 3 s).
  useEffect(() => {
    if (phase !== 'holding' && phase !== 'locked') return
    opts.current.sendTyping('recording')
    const t = setInterval(() => {
      // Never after stopTyping: a stop or discard is under way, or the phase has just changed.
      if (stoppingRef.current || (phaseRef.current !== 'holding' && phaseRef.current !== 'locked')) return
      const r = recorderRef.current
      if (r) setElapsed(r.elapsedMs())
      opts.current.sendTyping('recording')
    }, TICK_MS)
    return () => clearInterval(t)
  }, [phase])

  // The disguise, the PIN lock and the background leave nothing behind.
  useEffect(() => {
    const end = () => {
      actions.current.reset()
      discardUnsentVoice()
    }
    const unsubscribe = useUiStore.subscribe((s, prev) => {
      if ((s.eepMode && !prev.eepMode) || (s.pinLocked && !prev.pinLocked)) end()
    })
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') end()
    }
    document.addEventListener('visibilitychange', onVisibility)
    const stopApp = onAppStateChange((active) => {
      if (!active) end()
    })
    return () => {
      unsubscribe()
      document.removeEventListener('visibilitychange', onVisibility)
      stopApp()
    }
  }, [])

  // Another space or conversation, or the composer going away: discard.
  useEffect(() => () => actions.current.reset(), [options.conversationId, options.space])

  return {
    phase,
    elapsedMs,
    levels,
    drag,
    preview,
    hint,
    press: {
      onPointerDown: (e) => {
        pressPhaseRef.current = phaseRef.current
        // While the last memo is still stopping, a press starts nothing (and leaves no gesture behind).
        if (phaseRef.current !== 'idle' || stoppingRef.current || e.button !== 0) return
        e.preventDefault()
        if (e.pointerType !== 'mouse') {
          try {
            e.currentTarget.setPointerCapture(e.pointerId)
          } catch {
            // A pointer that already ended (or a synthetic one): the gesture still works on the button itself.
          }
        }
        feed({ type: 'down', pointerId: e.pointerId, pointerType: e.pointerType, x: e.clientX, y: e.clientY, t: Date.now() })
      },
      onPointerMove: (e) => feed({ type: 'move', pointerId: e.pointerId, x: e.clientX, y: e.clientY }),
      onPointerUp: (e) => feed({ type: 'up', pointerId: e.pointerId, t: Date.now() }),
      onPointerCancel: (e) => feed({ type: 'cancel', pointerId: e.pointerId }),
      onClick: (e) => {
        // Keyboard (Enter or Space on the focused button): detail 0, and no pointer press came first.
        if (e.detail === 0 && phaseRef.current === 'idle') {
          begin(true)
          return
        }
        const sending = phaseRef.current === 'locked' || phaseRef.current === 'preview'
        const pressedAsSend = e.detail === 0 || pressPhaseRef.current === 'locked' || pressPhaseRef.current === 'preview'
        if (sending && pressedAsSend) send()
      },
    },
    stopToPreview: () => void toPreview(),
    send,
    discard: reset,
  }
}
