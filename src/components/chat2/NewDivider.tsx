import { forwardRef } from 'react'

/** "New messages": above the first message that was unread when the space was opened. */
export const NewDivider = forwardRef<HTMLDivElement>(function NewDivider(_props, ref) {
  return (
    <div ref={ref} data-new-divider role="separator" aria-label="New messages" className="my-2 flex items-center gap-2">
      <span className="h-px flex-1 bg-[color:var(--accent)] opacity-60" />
      <span className="text-[11px] font-bold uppercase tracking-[.06em] text-[color:var(--accent)]">New messages</span>
      <span className="h-px flex-1 bg-[color:var(--accent)] opacity-60" />
    </div>
  )
})
