import { useEffect, type CSSProperties, type ReactNode } from 'react'
import { LoaderCircle, Mic, Pause, Play } from 'lucide-react'
import { Waveform } from '@/components/chat2/Waveform'
import { Icon } from '@/components/ui/Icon'
import { formatDuration } from '@/lib/gallery'
import { useAuthStore } from '@/stores/authStore'
import { useConversationStore } from '@/stores/conversationStore'
import { useProfileStore } from '@/stores/profileStore'
import { useVoicePlayerStore } from '@/stores/voicePlayer'
import { useVoicePlayStore } from '@/stores/voicePlays'
import type { Attachment, Message } from '@/types'

interface VoiceBubbleProps {
  message: Message
  attachment: Attachment
  mine: boolean
  /** The bubble's time and ticks, at the end of the footer line. */
  meta: ReactNode
}

const NONE: string[] = []

/** A voice memo inside its bubble: play/pause, the waveform slider, the length, and the played marker. */
export function VoiceBubble({ message, attachment, mine, meta }: VoiceBubbleProps) {
  const id = message.id
  const myId = useAuthStore((s) => s.user?.id ?? '')
  const partnerId = useConversationStore((s) => s.memberIds.find((m) => m !== myId) ?? null)
  // The ticks' rule: either person turning read receipts off hides "played" at once.
  const receiptsOn = useProfileStore(
    (s) => s.profiles[myId]?.read_receipts !== false && (partnerId ? s.profiles[partnerId]?.read_receipts !== false : true),
  )
  const plays = useVoicePlayStore((s) => s.byMessage[id] ?? NONE)
  const status = useVoicePlayerStore((s) => (s.current === id ? s.status : null))
  const position = useVoicePlayerStore((s) => (s.current === id ? s.position : 0))
  const failed = useVoicePlayerStore((s) => !!s.failed[id])

  useEffect(() => () => useVoicePlayerStore.getState().stop(id), [id])

  const total = (attachment.duration_ms ?? 0) / 1000
  const playing = status === 'playing'
  const active = playing || status === 'loading' || (status === 'paused' && position > 0)
  const unplayed = !mine && !message.localState && !!myId && !plays.includes(myId)
  const played = mine && receiptsOn && plays.some((u) => u !== myId)

  const play = () => {
    void useVoicePlayerStore
      .getState()
      .toggle(id, attachment.url)
      .then((started) => {
        if (started && !mine && !message.localState && myId) void useVoicePlayStore.getState().markPlayed(id, myId)
      })
  }

  const colours = (
    mine
      ? { '--wave-on': 'var(--me-fg)', '--wave-off': 'color-mix(in srgb, var(--me-fg) 35%, transparent)' }
      : { '--wave-on': 'var(--accent)', '--wave-off': 'color-mix(in srgb, var(--muted) 45%, transparent)' }
  ) as CSSProperties

  return (
    <div data-voice-bubble data-voice-state={status ?? 'idle'} className="flex w-[272px] max-w-full flex-col gap-1" style={colours}>
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            play()
          }}
          aria-label={playing ? 'Pause voice message' : 'Play voice message'}
          className={`grid h-9 w-9 flex-none place-items-center rounded-full ${
            mine ? 'bg-[color:var(--me-fg)] text-[color:var(--me)]' : 'bg-[color:var(--accent)] text-[color:var(--on-accent)]'
          }`}
        >
          {status === 'loading' ? (
            <Icon icon={LoaderCircle} size={16} className="motion-safe:animate-spin" />
          ) : (
            <Icon icon={playing ? Pause : Play} size={16} fill="currentColor" strokeWidth={0} />
          )}
        </button>
        <Waveform
          peaks={attachment.peaks}
          position={position}
          duration={total}
          onSeek={(s) => useVoicePlayerStore.getState().seek(id, attachment.url, s)}
          label="Voice message position"
          thumb={active}
        />
      </div>
      <div className={`flex items-center gap-1.5 pl-[46px] text-[12px] ${mine ? 'text-[color:var(--me-muted)]' : 'text-[color:var(--muted)]'}`}>
        {mine && (
          <Icon
            icon={Mic}
            size={13}
            strokeWidth={2.4}
            {...(played ? { role: 'img', 'aria-label': 'Played' } : {})}
            className={played ? 'text-[color:var(--tick)]' : ''}
          />
        )}
        <span className="tabular-nums">{failed ? "Can't play" : active ? `${formatDuration(position)} / ${formatDuration(total)}` : formatDuration(total)}</span>
        {unplayed && <span role="img" aria-label="Not played yet" className="h-[7px] w-[7px] rounded-full bg-[color:var(--accent)]" />}
        <span className="flex-1" />
        {meta}
      </div>
    </div>
  )
}
