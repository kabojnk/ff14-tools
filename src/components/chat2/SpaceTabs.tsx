import { useRef, type KeyboardEvent } from 'react'
import { SPACES, SPACE_LABEL, isUnread } from '@/lib/spaces'
import { useAuthStore } from '@/stores/authStore'
import { useConversationStore } from '@/stores/conversationStore'
import type { Space } from '@/types'

/**
 * The Main|Schist switch: a two-segment tablist. The inactive space shows a dot when it's unread, and the
 * highlight slides between the tabs (120 ms; none with reduced motion). `data-space`/`data-unread` are e2e hooks.
 */
export function SpaceTabs({ className = '' }: { className?: string }) {
  const myId = useAuthStore((s) => s.user?.id ?? null)
  const activeSpace = useConversationStore((s) => s.activeSpace)
  const latest = useConversationStore((s) => s.latest)
  const readAt = useConversationStore((s) => s.readAt)
  const setActiveSpace = useConversationStore((s) => s.setActiveSpace)
  const tabRefs = useRef<Partial<Record<Space, HTMLButtonElement | null>>>({})
  const activeIndex = SPACES.indexOf(activeSpace)

  const select = (space: Space, focus = false) => {
    setActiveSpace(space)
    if (focus) tabRefs.current[space]?.focus()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const n = SPACES.length
    let next: number | null = null
    if (e.key === 'ArrowRight') next = (index + 1) % n
    else if (e.key === 'ArrowLeft') next = (index - 1 + n) % n
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = n - 1
    if (next === null) return
    e.preventDefault()
    select(SPACES[next], true)
  }

  return (
    <div
      role="tablist"
      aria-label="Spaces"
      className={`relative grid grid-cols-2 rounded-[10px] bg-[color:var(--seg)] p-[3px] text-xs font-semibold ${className}`}
    >
      <span
        data-tab-highlight
        aria-hidden
        className="pointer-events-none absolute bottom-[3px] left-[3px] top-[3px] w-[calc(50%-3px)] rounded-lg bg-[color:var(--seg-on)] shadow-[0_1px_2px_var(--shadow)] transition-transform duration-[120ms] ease-out motion-reduce:transition-none"
        style={{ transform: `translateX(${activeIndex * 100}%)` }}
      />
      {SPACES.map((space, i) => {
        const active = space === activeSpace
        const unread = isUnread({
          latestAt: latest[space]?.at ?? null,
          latestAuthorId: latest[space]?.authorId ?? null,
          lastReadAt: readAt[space],
          myId,
        })
        return (
          <button
            key={space}
            ref={(el) => {
              tabRefs.current[space] = el
            }}
            type="button"
            role="tab"
            data-space={space}
            data-unread={String(unread)}
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => select(space)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`relative z-[1] flex items-center justify-center rounded-lg py-[5px] transition-colors ${
              active ? 'text-[color:var(--fg)]' : 'text-[color:var(--muted)] hover:text-[color:var(--fg)]'
            }`}
          >
            {SPACE_LABEL[space]}
            {unread && !active && (
              <>
                <span data-unread-dot aria-hidden className="ml-1.5 h-1.5 w-1.5 rounded-full bg-[color:var(--accent)]" />
                <span className="sr-only">, unread</span>
              </>
            )}
          </button>
        )
      })}
    </div>
  )
}
