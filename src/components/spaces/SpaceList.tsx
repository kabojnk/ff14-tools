import { SPACES, SPACE_LABEL, isUnread } from '@/lib/spaces'
import { useAuthStore } from '@/stores/authStore'
import { useConversationStore } from '@/stores/conversationStore'
import type { Space } from '@/types'

interface SpaceListProps {
  /** `mobile` is the full-screen list: taller rows with a chevron. */
  variant?: 'sidebar' | 'mobile'
  onSelect?: (space: Space) => void
}

/** The two fixed spaces of the conversation, Main and Schist, with unread state. */
export function SpaceList({ variant = 'sidebar', onSelect }: SpaceListProps) {
  const myId = useAuthStore((s) => s.user?.id ?? null)
  const conversation = useConversationStore((s) => s.conversation)
  const loading = useConversationStore((s) => s.loading)
  const activeSpace = useConversationStore((s) => s.activeSpace)
  const latest = useConversationStore((s) => s.latest)
  const readAt = useConversationStore((s) => s.readAt)
  const setActiveSpace = useConversationStore((s) => s.setActiveSpace)
  const mobile = variant === 'mobile'

  const select = (space: Space) => {
    setActiveSpace(space)
    onSelect?.(space)
  }

  return (
    <div className="px-3 py-3">
      <div className="mb-1 flex items-center justify-between px-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Spaces</span>
      </div>

      {conversation ? (
        <div className="space-y-0.5">
          {SPACES.map((space) => {
            const unread = isUnread({
              latestAt: latest[space]?.at ?? null,
              latestAuthorId: latest[space]?.authorId ?? null,
              lastReadAt: readAt[space],
              myId,
            })
            const active = activeSpace === space
            return (
              <button
                key={space}
                data-space={space}
                data-unread={String(unread)}
                aria-current={active ? 'true' : undefined}
                onClick={() => select(space)}
                className={`
                  group flex w-full items-center gap-1.5 rounded-[4px] px-2.5 text-left transition-colors
                  ${mobile ? 'py-2.5' : 'py-1.5'}
                  ${active
                    ? 'bg-active text-interactive-active'
                    : unread
                      ? 'text-primary hover:bg-hover'
                      : 'text-interactive hover:bg-hover hover:text-interactive-hover'
                  }
                `}
              >
                <span className={`flex-1 truncate text-[15px] leading-5 ${unread ? 'font-semibold' : ''}`}>
                  {SPACE_LABEL[space]}
                </span>
                {unread && (
                  <span
                    aria-label="Unread messages"
                    className="h-2 w-2 flex-shrink-0 rounded-full bg-[hsl(var(--color-text-primary))]"
                  />
                )}
                {mobile && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 opacity-30">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                )}
              </button>
            )
          })}
        </div>
      ) : (
        !loading && <p className="px-2 py-4 text-center text-xs text-muted">No conversation yet.</p>
      )}
    </div>
  )
}
