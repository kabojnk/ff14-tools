import { messagePreview } from '@/lib/chat'
import type { Message } from '@/types'

interface ReplyStripProps {
  /** The original: a message, null when it's gone (deleted or dragged), undefined while looking it up. */
  original: Message | null | undefined
  authorName: string | null
  onJump: () => void
}

/** The quoted original at the top of a reply bubble. Tapping it scrolls to the original and flashes it. */
export function ReplyStrip({ original, authorName, onJump }: ReplyStripProps) {
  const gone = original === null
  const snippet = original === undefined ? '…' : gone ? 'Original message deleted' : messagePreview(original)
  return (
    <button
      type="button"
      data-reply-strip
      disabled={gone}
      onClick={(e) => {
        e.stopPropagation()
        onJump()
      }}
      aria-label={gone ? 'Original message deleted' : `Reply to ${authorName ?? 'a message'}: ${snippet}`}
      className="mb-1 block w-full min-w-32 rounded-[6px] border-l-[3px] border-[color:var(--accent)] bg-black/10 px-2 py-1 text-left text-[13px] leading-[1.3] disabled:cursor-default"
    >
      {!gone && authorName && <span className="block truncate font-semibold text-[color:var(--accent)]">{authorName}</span>}
      <span className={`block truncate ${gone ? 'italic opacity-70' : 'opacity-85'}`}>{snippet}</span>
    </button>
  )
}
