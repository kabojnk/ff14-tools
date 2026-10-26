import { useEffect } from 'react'
import { LoaderCircle, Pause, Play } from 'lucide-react'
import { Icon } from '@/components/ui/Icon'
import { formatDuration, formatItemDate } from '@/lib/gallery'
import { SPACE_LABEL } from '@/lib/spaces'
import { useAuthStore } from '@/stores/authStore'
import { useJumpStore } from '@/stores/jumpStore'
import { useProfileStore } from '@/stores/profileStore'
import { useVoicePlayerStore } from '@/stores/voicePlayer'
import { useVoicePlayStore } from '@/stores/voicePlays'
import type { MediaItem } from '@/types'

/**
 * A voice memo in the gallery's Voice tab: play, "Bea · 0:42", "Main · 23 Oct", Show in chat. It plays
 * under its own player id, so closing the gallery never stops the same memo playing in the chat.
 */
export function VoiceRow({ item, now, dim }: { item: MediaItem; now: Date; dim: boolean }) {
  const id = item.message_id
  const playerId = `gallery:${id}`
  const myId = useAuthStore((s) => s.user?.id ?? null)
  const nickname = useProfileStore((s) => (item.author_id ? s.profiles[item.author_id]?.nickname : undefined))
  const status = useVoicePlayerStore((s) => (s.current === playerId ? s.status : null))
  const failed = useVoicePlayerStore((s) => !!s.failed[playerId])
  useEffect(() => () => useVoicePlayerStore.getState().stop(playerId), [playerId])

  const mine = !!item.author_id && item.author_id === myId
  const who = mine ? 'You' : (nickname ?? '')
  const length = item.duration_ms != null ? formatDuration(item.duration_ms / 1000) : ''
  const title = [who, length].filter(Boolean).join(' · ')
  const meta = failed ? "Can't play" : [SPACE_LABEL[item.space], formatItemDate(item.created_at, now)].join(' · ')
  const playing = status === 'playing'

  const play = () => {
    void useVoicePlayerStore
      .getState()
      .toggle(playerId, item.url)
      .then((started) => {
        if (started && !mine && myId) void useVoicePlayStore.getState().markPlayed(id, myId)
      })
  }

  return (
    <div
      {...(dim ? { 'data-media-fallback': item.kind } : { 'data-media-item': item.kind })}
      className={`flex items-center gap-2.5 rounded-[10px] border border-[color:var(--line)] bg-[color:var(--them)] p-2 ${dim ? 'opacity-45' : ''}`}
    >
      <button
        type="button"
        onClick={play}
        aria-label={playing ? 'Pause voice message' : 'Play voice message'}
        className="grid h-[38px] w-[38px] flex-none place-items-center rounded-full bg-[color:var(--accent)] text-[color:var(--on-accent)]"
      >
        {status === 'loading' ? (
          <Icon icon={LoaderCircle} size={16} className="motion-safe:animate-spin" />
        ) : (
          <Icon icon={playing ? Pause : Play} size={16} fill="currentColor" strokeWidth={0} />
        )}
      </button>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[13px] font-semibold text-[color:var(--fg)]">{title}</span>
        <span className="truncate text-[11px] text-[color:var(--muted)]">{meta}</span>
      </span>
      <button
        type="button"
        onClick={() => useJumpStore.getState().request({ messageId: id, space: item.space, created_at: item.created_at })}
        className="flex-none text-[13px] font-semibold text-[color:var(--accent)] hover:underline"
      >
        Show in chat
      </button>
    </div>
  )
}
