import type { ReactNode } from 'react'
import { Pin } from 'lucide-react'
import Markdown, { type EmojiLookup } from '@/components/chat2/Markdown'
import { MediaBlock } from '@/components/chat2/MediaBlock'
import { Ticks } from '@/components/chat2/Ticks'
import { Icon } from '@/components/ui/Icon'
import type { Tick } from '@/lib/chat'
import type { Message } from '@/types'

interface BubbleProps {
  message: Message
  mine: boolean
  /** First bubble of a run: the squared-off corner. */
  tail: boolean
  /** Delivery state (shown on my messages only). */
  tick?: Tick
  onRetry?: () => void
  emoji?: EmojiLookup
  /** A code block finished highlighting (its height changed). */
  onHighlight?: () => void
  pinned?: boolean
  /** Above the content: the reply strip. */
  header?: ReactNode
}

const VISUAL = new Set(['image', 'video', 'gif'])

const formatTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

/** One Cozy chat bubble: reply strip, media, markdown text, and the time tucked in at the bottom right. */
export function Bubble({ message, mine, tail, tick, onRetry, emoji, onHighlight, pinned, header }: BubbleProps) {
  const { content, attachments } = message
  const hasText = !!content
  const mediaOnly = !hasText && attachments.length > 0 && attachments.every((a) => VISUAL.has(a.type)) && !header

  const meta = (
    <span
      data-meta
      className={`float-right ml-2.5 mt-1.5 inline-flex items-center gap-1 text-[10.5px] leading-4 ${
        mine ? 'text-[color:var(--me-muted)]' : 'text-[color:var(--muted)]'
      }`}
    >
      {message.edited_at && <span>edited</span>}
      {pinned && <Icon icon={Pin} size={10} role="img" aria-label="Pinned" />}
      <time dateTime={message.created_at} title={new Date(message.created_at).toLocaleString()}>
        {formatTime(message.created_at)}
      </time>
      {mine && tick && <Ticks state={tick} onRetry={onRetry} />}
    </span>
  )

  return (
    <div
      data-bubble
      data-mine={mine}
      data-tail={tail}
      className={`flow-root max-w-[var(--bubble-max,78%)] rounded-[10px] text-[15px] leading-[1.33] break-words shadow-[0_1px_0_var(--shadow)] ${
        mediaOnly ? 'p-[3px]' : 'px-[9px] pb-[5px] pt-[6px]'
      } ${
        mine
          ? `bg-[color:var(--me)] text-[color:var(--me-fg)] [--accent:var(--me-link)] [--muted:var(--me-muted)] ${tail ? 'rounded-tr-[2px]' : ''}`
          : `bg-[color:var(--them)] text-[color:var(--fg)] ${tail ? 'rounded-tl-[2px]' : ''}`
      }`}
    >
      {header}
      {attachments.length > 0 && (
        <div className={hasText ? 'mb-1' : ''}>
          <MediaBlock
            // Keyed by the spoiler flags: an item re-marked as a spoiler blurs again, even if revealed.
            key={`${message.id}:${attachments.map((a) => (a.spoiler ? 1 : 0)).join('')}`}
            messageId={message.id}
            attachments={attachments}
            overlay={mediaOnly ? meta : undefined}
          />
        </div>
      )}
      {hasText ? (
        <>
          <Markdown content={content} emoji={emoji} onHighlight={onHighlight} className="inline" />
          {meta}
        </>
      ) : (
        !mediaOnly && meta
      )}
    </div>
  )
}
