import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { SmilePlus } from 'lucide-react'
import { Icon } from '@/components/ui/Icon'
import type { EmojiLookup } from '@/components/chat2/Markdown'
import { EmojiGlyph, QuickReactBar } from '@/components/chat2/QuickReactBar'
import { DESKTOP_QUERY, useMediaQuery } from '@/hooks/useMediaQuery'
import { noteRecentEmoji } from '@/lib/recentEmoji'
import { useAuthStore } from '@/stores/authStore'
import { useEmojiStore } from '@/stores/emojiStore'
import { useProfileStore } from '@/stores/profileStore'
import { chipsOf, isFromLoad, useReactionStore, type ReactionChip } from '@/stores/reactionStore'

const LONG_PRESS_MS = 450
const WHO_VISIBLE_MS = 2500

export interface ReactionsProps {
  /** `fresh`: arrived live (not with the history), so the chip pops in. */
  chips: (ReactionChip & { fresh?: boolean })[]
  side: 'me' | 'them'
  isDesktop: boolean
  emoji: EmojiLookup
  /** "You, Bea" for a chip's reactors. */
  whoReacted: (userIds: string[]) => string
  onToggle: (emoji: string) => void
}

/** The chips under a bubble, on its side, plus the add chip (phones: always; desktop: on row hover). */
export function Reactions({ chips, side, isDesktop, emoji, whoReacted, onToggle }: ReactionsProps) {
  const [picking, setPicking] = useState(false)
  const closePicker = useCallback(() => setPicking(false), [])
  if (chips.length === 0) return null

  return (
    <div
      data-reactions
      className={`relative mt-[3px] flex max-w-[var(--bubble-max,78%)] flex-wrap gap-1 ${side === 'me' ? 'justify-end' : ''}`}
    >
      {chips.map((c) => (
        <Chip key={c.emoji} chip={c} emoji={emoji} who={whoReacted(c.userIds)} onToggle={onToggle} />
      ))}
      <button
        type="button"
        aria-label="Add reaction"
        aria-expanded={picking}
        onClick={() => setPicking((v) => !v)}
        className={`rx inline-flex items-center rounded-[8px] border border-[color:var(--line)] bg-[color:var(--chip)] px-[5px] py-px leading-[18px] text-[color:var(--muted)] transition-opacity hover:text-[color:var(--fg)] ${
          isDesktop && !picking ? 'opacity-0 focus-visible:opacity-100 group-hover/row:opacity-100' : ''
        }`}
      >
        <Icon icon={SmilePlus} size={14} />
      </button>
      {picking && (
        <QuickReactBar
          emoji={emoji}
          align={side === 'me' ? 'end' : 'start'}
          onPick={onToggle}
          onClose={closePicker}
          className={`!absolute bottom-full mb-1 ${side === 'me' ? 'right-0' : 'left-0'}`}
        />
      )}
    </div>
  )
}

function Chip({
  chip,
  emoji,
  who,
  onToggle,
}: {
  chip: ReactionChip & { fresh?: boolean }
  emoji: EmojiLookup
  who: string
  onToggle: (emoji: string) => void
}) {
  // Decided once, when the chip first appears: history doesn't animate (design §10).
  const [pop] = useState(() => chip.fresh === true)
  const [showWho, setShowWho] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressed = useRef(false)
  const tipId = useId()

  const clear = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }
  useEffect(() => clear, [])

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-pressed={chip.mine}
        aria-label={`${chip.emoji} ${chip.count}`}
        aria-describedby={showWho ? tipId : undefined}
        data-emoji={chip.emoji}
        onClick={() => {
          if (longPressed.current) {
            longPressed.current = false
            return
          }
          onToggle(chip.emoji)
        }}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse') return
          longPressed.current = false
          clear()
          timer.current = setTimeout(() => {
            longPressed.current = true
            navigator.vibrate?.(10)
            setShowWho(true)
            timer.current = setTimeout(() => setShowWho(false), WHO_VISIBLE_MS)
          }, LONG_PRESS_MS)
        }}
        onPointerUp={() => {
          if (!longPressed.current) clear()
        }}
        onPointerCancel={clear}
        onPointerEnter={(e) => {
          if (e.pointerType === 'mouse') setShowWho(true)
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === 'mouse') setShowWho(false)
          else if (!longPressed.current) clear()
        }}
        onContextMenu={(e) => e.preventDefault()}
        className={`rx inline-flex select-none items-center gap-1 rounded-[8px] border px-[7px] py-px text-[11.5px] leading-[18px] text-[color:var(--fg)] [-webkit-touch-callout:none] ${
          chip.mine
            ? 'border-[color:var(--chip-on-line)] bg-[color:var(--chip-on)]'
            : 'border-[color:var(--line)] bg-[color:var(--chip)]'
        } ${pop ? 'rx-pop' : ''}`}
      >
        <EmojiGlyph emoji={chip.emoji} lookup={emoji} size={16} />
        <b className={`text-[11px] font-semibold ${chip.mine ? 'text-[color:var(--fg)]' : 'text-[color:var(--muted)]'}`}>
          {chip.count}
        </b>
      </button>
      {showWho && (
        <span
          id={tipId}
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-[color:var(--bar)] px-2 py-1 text-xs text-[color:var(--fg)] shadow-lg"
        >
          {who}
        </span>
      )}
    </span>
  )
}

/** A confirmed message's reactions, from the reaction store. */
export function MessageReactions({ messageId, mine }: { messageId: string; mine: boolean }) {
  const myId = useAuthStore((s) => s.user?.id) ?? ''
  const list = useReactionStore((s) => s.byMessage[messageId])
  const profiles = useProfileStore((s) => s.profiles)
  const lookup = useEmojiStore((s) => s.lookup)
  const isDesktop = useMediaQuery(DESKTOP_QUERY)

  const chips = useMemo(
    () =>
      chipsOf(list, myId).map((c) => ({
        ...c,
        fresh: !(list ?? []).some((r) => r.emoji === c.emoji && isFromLoad(r)),
      })),
    [list, myId],
  )

  const whoReacted = useCallback(
    (ids: string[]) =>
      [...ids]
        .sort((a, b) => Number(b === myId) - Number(a === myId))
        .map((id) => (id === myId ? 'You' : (profiles[id]?.nickname ?? 'Someone')))
        .join(', '),
    [myId, profiles],
  )

  const onToggle = useCallback(
    (emoji: string) => {
      if (!myId) return
      const adding = !chipsOf(useReactionStore.getState().byMessage[messageId], myId).some((c) => c.emoji === emoji && c.mine)
      if (adding) noteRecentEmoji(emoji)
      void useReactionStore.getState().toggle(messageId, emoji, myId)
    },
    [messageId, myId],
  )

  return (
    <Reactions
      chips={chips}
      side={mine ? 'me' : 'them'}
      isDesktop={isDesktop}
      emoji={lookup}
      whoReacted={whoReacted}
      onToggle={onToggle}
    />
  )
}
