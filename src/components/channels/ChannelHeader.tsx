import { useState } from 'react'
import { useConversationStore } from '@/stores/conversationStore'
import { SPACE_LABEL } from '@/lib/spaces'
import type { Space } from '@/types'
import type { InfoTab } from '@/components/chat/ChannelInfoPanel'

interface ChannelHeaderProps {
  space: Space
  /** Phone layout: the back chevron to the conversation list. Without it, the desktop header. */
  mobileBack?: () => void
  onInfoOpen?: (tab?: InfoTab) => void
}

export function ChannelHeader({ space, mobileBack, onInfoOpen }: ChannelHeaderProps) {
  const dragTheLake = useConversationStore((s) => s.dragTheLake)
  const phone = !!mobileBack
  const [showMenu, setShowMenu] = useState(false)
  const label = SPACE_LABEL[space]

  const handleDragTheLake = () => {
    void dragTheLake()
    setShowMenu(false)
  }

  return (
    <div className="relative flex-shrink-0 border-b border-[color:var(--line)] bg-primary shadow-sm">
      {phone && <div className="pt-safe" />}
    <div
      className="flex h-[var(--header-height)] items-center gap-2"
      style={{ paddingLeft: 'max(1.25rem, env(safe-area-inset-left))', paddingRight: 'max(1.25rem, env(safe-area-inset-right))' }}
    >
      {mobileBack && (
        <button
          onClick={mobileBack}
          className="mr-1 rounded p-1 text-interactive hover:text-interactive-hover"
          aria-label="Back to chats"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      )}

      {/* Space name — tappable on mobile to open info panel */}
      {onInfoOpen ? (
        <button
          onClick={() => onInfoOpen()}
          className={`flex items-center gap-0.5 text-left ${phone ? '' : 'pointer-events-none'}`}
        >
          <h3 className="text-[15px] font-semibold text-primary">{label}</h3>
          {phone && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          )}
        </button>
      ) : (
        <h3 className="text-[15px] font-semibold text-primary">{label}</h3>
      )}

      <div className="flex-1" />

      {/* Desktop utility icons — Pins, Media, Search */}
      {onInfoOpen && !phone && (
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => onInfoOpen('pins')}
            className="rounded p-1.5 text-interactive transition-colors hover:bg-hover hover:text-interactive-hover"
            title="Pinned Messages"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="17" x2="12" y2="22" />
              <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
            </svg>
          </button>
          <button
            onClick={() => onInfoOpen('media')}
            className="rounded p-1.5 text-interactive transition-colors hover:bg-hover hover:text-interactive-hover"
            title="Media"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </button>
          <button
            onClick={() => onInfoOpen('search')}
            className="rounded p-1.5 text-interactive transition-colors hover:bg-hover hover:text-interactive-hover"
            title="Search Messages"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </button>
        </div>
      )}

      {/* Space actions */}
      <div className="relative">
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="rounded p-1.5 text-interactive transition-colors hover:bg-hover hover:text-interactive-hover"
          title="More actions"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="1" />
            <circle cx="19" cy="12" r="1" />
            <circle cx="5" cy="12" r="1" />
          </svg>
        </button>

        {/* Dropdown menu */}
        {showMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
            <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-md bg-floating p-1 shadow-lg">
              <button
                onClick={handleDragTheLake}
                className="flex w-full items-center gap-2 rounded-[3px] px-2 py-1.5 text-left text-sm text-interactive transition-colors hover:bg-brand hover:text-on-accent"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18" />
                  <path d="M3 12h18" />
                  <path d="M3 18h18" />
                </svg>
                Drag the Lake
              </button>
            </div>
          </>
        )}
      </div>
    </div>
    </div>
  )
}
