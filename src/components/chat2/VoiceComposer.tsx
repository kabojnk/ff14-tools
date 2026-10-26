import { useEffect, type CSSProperties } from 'react'
import { ChevronUp, Lock, Mic, Pause, Play, SendHorizontal, Square, Trash2 } from 'lucide-react'
import { Waveform } from '@/components/chat2/Waveform'
import { Icon } from '@/components/ui/Icon'
import { PREVIEW_ID, type VoiceSession } from '@/components/chat2/useVoiceSession'
import { formatDuration } from '@/lib/gallery'
import { CANCEL_PX, LOCK_PX } from '@/lib/voice/gesture'
import { MAX_RECORDING_MS, WARN_AT_MS } from '@/lib/voice/recorder'
import { isDisguised } from '@/stores/uiStore'
import { useVoicePlayerStore } from '@/stores/voicePlayer'

const FIELD = 'flex h-[38px] min-w-0 flex-1 items-center gap-2 rounded-[19px] border border-[color:var(--line)] bg-[color:var(--field)] px-3'

/** The round button right of the field: the mic, growing while held (with the lock above it), then Send. */
export function MicButton({ session }: { session: VoiceSession }) {
  const { phase, drag } = session
  const sending = phase === 'locked' || phase === 'preview'
  const holding = phase === 'holding'
  const label = sending ? 'Send voice message' : holding ? 'Release to send' : 'Record a voice message'
  return (
    <div className="relative flex-none">
      {holding && (
        <span
          data-voice-lock
          aria-hidden="true"
          className="pointer-events-none absolute bottom-[calc(100%+30px)] left-1/2 flex flex-col items-center gap-0.5 rounded-full border border-[color:var(--line)] bg-[color:var(--bar)] px-2 py-2 text-[color:var(--muted)] shadow-[0_2px_8px_var(--shadow)]"
          style={{ transform: `translate(-50%, ${Math.max(drag.dy, -LOCK_PX)}px)` }}
        >
          <Icon icon={Lock} size={16} />
          <Icon icon={ChevronUp} size={14} />
        </span>
      )}
      <button
        type="button"
        aria-label={label}
        title={sending ? 'Send' : holding ? undefined : 'Hold to record'}
        {...session.press}
        // Keeps the phone keyboard and the field's focus as they were.
        onMouseDown={(e) => e.preventDefault()}
        onContextMenu={(e) => e.preventDefault()}
        className={`grid h-[38px] w-[38px] touch-none select-none place-items-center rounded-full bg-[color:var(--accent)] text-[color:var(--on-accent)] transition-transform [-webkit-touch-callout:none] ${
          holding ? 'scale-[1.6]' : ''
        }`}
      >
        <Icon icon={sending ? SendHorizontal : Mic} />
      </button>
    </div>
  )
}

/** Takes the field's place while recording (holding, locked) or previewing. */
export function VoicePanel({ session, isDesktop }: { session: VoiceSession; isDesktop: boolean }) {
  const { phase, elapsedMs, levels, drag, send, discard } = session

  // Desktop: Enter sends and Esc deletes while locked or previewing (the field is gone). Esc still reaches
  // AppShell's double-Esc disguise on purpose: a panicked Esc Esc must always hide the app.
  useEffect(() => {
    if (!isDesktop || (phase !== 'locked' && phase !== 'preview')) return
    const onKey = (e: KeyboardEvent) => {
      if (isDisguised() || e.isComposing) return
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        send()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        discard()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isDesktop, phase, send, discard])

  if (phase === 'holding') {
    return (
      <div data-voice-panel="holding" className="flex h-[38px] min-w-0 flex-1 items-center gap-2.5 px-2">
        <RecDot />
        <Timer ms={elapsedMs} />
        <LiveBars levels={levels} />
        <span
          aria-hidden="true"
          className="ml-auto flex-none text-[13px] text-[color:var(--muted)]"
          style={{ transform: `translateX(${drag.dx}px)`, opacity: Math.max(0.2, 1 + drag.dx / CANCEL_PX) }}
        >
          ‹ Slide to cancel
        </span>
      </div>
    )
  }

  if (phase === 'locked') {
    return (
      <div data-voice-panel="locked" className="flex min-w-0 flex-1 items-center gap-2">
        <DeleteButton onClick={discard} />
        <div className={FIELD}>
          <RecDot />
          <Timer ms={elapsedMs} />
          <LiveBars levels={levels} />
          <button
            type="button"
            aria-label="Stop and preview"
            title="Stop and preview"
            onClick={session.stopToPreview}
            className="grid h-[30px] w-[30px] flex-none place-items-center rounded-full border-2 border-[color:var(--danger)] text-[color:var(--danger)]"
          >
            <Icon icon={Square} size={11} fill="currentColor" strokeWidth={0} />
          </button>
        </div>
      </div>
    )
  }

  return <PreviewPanel session={session} />
}

function PreviewPanel({ session }: { session: VoiceSession }) {
  const p = session.preview
  const status = useVoicePlayerStore((s) => (s.current === PREVIEW_ID ? s.status : null))
  const position = useVoicePlayerStore((s) => (s.current === PREVIEW_ID ? s.position : 0))
  if (!p) return null
  const total = p.recording.durationMs / 1000
  const playing = status === 'playing'
  return (
    <div data-voice-panel="preview" className="flex min-w-0 flex-1 items-center gap-2">
      <DeleteButton onClick={session.discard} />
      <div
        className={`${FIELD} pl-1.5`}
        style={{ '--wave-on': 'var(--accent)', '--wave-off': 'color-mix(in srgb, var(--muted) 45%, transparent)' } as CSSProperties}
      >
        <button
          type="button"
          aria-label={playing ? 'Pause preview' : 'Play preview'}
          onClick={() => void useVoicePlayerStore.getState().toggle(PREVIEW_ID, p.url)}
          className="grid h-8 w-8 flex-none place-items-center rounded-full bg-[color:var(--accent)] text-[color:var(--on-accent)]"
        >
          <Icon icon={playing ? Pause : Play} size={14} fill="currentColor" strokeWidth={0} />
        </button>
        <Waveform
          peaks={p.recording.peaks}
          position={position}
          duration={total}
          bars={30}
          onSeek={(s) => useVoicePlayerStore.getState().seek(PREVIEW_ID, p.url, s)}
          label="Preview position"
        />
        <span className="flex-none text-[13px] tabular-nums text-[color:var(--muted)]">{formatDuration(total)}</span>
      </div>
    </div>
  )
}

function DeleteButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="Delete recording"
      title="Delete recording"
      onClick={onClick}
      className="grid h-[38px] w-[38px] flex-none place-items-center rounded-full text-[color:var(--danger)]"
    >
      <Icon icon={Trash2} />
    </button>
  )
}

function RecDot() {
  return <span aria-hidden="true" className="h-[9px] w-[9px] flex-none rounded-full bg-[color:var(--danger)] motion-safe:animate-pulse" />
}

/** "1:24"; from 9:30, red with the time left: "9:41 · 0:19 left". */
function Timer({ ms }: { ms: number }) {
  const elapsed = formatDuration(Math.floor(ms / 1000))
  const warn = ms >= WARN_AT_MS
  const text = warn ? `${elapsed} · ${formatDuration(Math.ceil((MAX_RECORDING_MS - ms) / 1000))} left` : elapsed
  return (
    <span className="flex-none font-semibold tabular-nums">
      <span className="sr-only">Recording </span>
      <span data-warn={warn ? '' : undefined} className={warn ? 'text-[color:var(--danger)]' : 'text-[color:var(--fg)]'}>
        {text}
      </span>
    </span>
  )
}

/** The newest levels as bars, scrolling in from the right. */
function LiveBars({ levels }: { levels: number[] }) {
  return (
    <div aria-hidden="true" className="flex h-6 min-w-0 flex-1 items-center justify-end gap-[2px] overflow-hidden">
      {levels.map((l, i) => (
        <span key={i} className="block w-[3px] flex-none rounded-[2px] bg-[color:var(--muted)]" style={{ height: `${Math.round(4 + l * 20)}px` }} />
      ))}
    </div>
  )
}

/** Desktop, under the row while locked or previewing. */
export function VoiceKeysHint() {
  return <span className="mt-1 block pl-12 text-[12px] text-[color:var(--muted)]">Enter sends · Esc deletes</span>
}

/** A short message above the composer ("Hold to record", microphone problems). */
export function VoiceHint({ text }: { text: string }) {
  return (
    <div
      role="status"
      className="msg-in pointer-events-none absolute -top-10 right-3 z-10 max-w-[85%] rounded-full bg-[color:var(--bar)] px-3 py-1.5 text-[13px] text-[color:var(--fg)] shadow-[0_2px_8px_var(--shadow)]"
    >
      {text}
    </div>
  )
}
