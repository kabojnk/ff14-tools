import { useState } from 'react'
import { useChannelStore } from '@/stores/channelStore'
import { useUiStore } from '@/stores/uiStore'
import type { Channel } from '@/types'

interface ChannelHeaderProps {
  channel: Channel
  mobileBack?: () => void // when provided, shows a back arrow instead of hamburger
}

export function ChannelHeader({ channel, mobileBack }: ChannelHeaderProps) {
  const { archiveChannel, changeSheets } = useChannelStore()
  const { toggleSidebar, toggleMemberList, memberListOpen } = useUiStore()
  const [showMenu, setShowMenu] = useState(false)

  const handleChangeSheets = () => {
    changeSheets(channel.id)
    setShowMenu(false)
  }

  const handleArchive = () => {
    if (channel.name === 'general') return // Don't archive the default channel
    archiveChannel(channel.id)
    setShowMenu(false)
  }

  return (
    <div className="relative flex h-[var(--header-height)] flex-shrink-0 items-center gap-2 border-b border-[hsl(var(--color-bg-tertiary))] px-5 shadow-sm">
      {/* Mobile nav button — back arrow when mobileBack provided, otherwise hamburger */}
      <button
        onClick={mobileBack ?? toggleSidebar}
        className="mr-1 rounded p-1 text-interactive hover:text-interactive-hover md:hidden"
        aria-label={mobileBack ? 'Back to channels' : 'Toggle sidebar'}
      >
        {mobileBack ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        )}
      </button>

      {/* Channel name */}
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-muted">
        <line x1="4" y1="9" x2="20" y2="9" />
        <line x1="4" y1="15" x2="20" y2="15" />
        <line x1="10" y1="3" x2="8" y2="21" />
        <line x1="16" y1="3" x2="14" y2="21" />
      </svg>
      <h3 className="text-[15px] font-semibold text-primary">{channel.name}</h3>

      {/* Description divider + text */}
      {channel.description && (
        <>
          <div className="mx-2 h-5 w-px bg-[hsl(var(--color-input-border))]" />
          <p className="truncate text-sm text-muted">{channel.description}</p>
        </>
      )}

      <div className="flex-1" />

      {/* Member list toggle — desktop only (mobile uses the Members tab) */}
      <button
        onClick={toggleMemberList}
        className={`hidden rounded p-1.5 transition-colors hover:bg-hover md:block ${memberListOpen ? 'text-interactive-hover' : 'text-interactive'}`}
        title={memberListOpen ? 'Hide member list' : 'Show member list'}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="9" cy="7" r="4" />
          <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          <path d="M21 21v-2a4 4 0 0 0-3-3.85" />
        </svg>
      </button>

      {/* Channel actions */}
      <div className="relative">
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="rounded p-1.5 text-interactive transition-colors hover:bg-hover hover:text-interactive-hover"
          title="Channel settings"
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
                onClick={handleChangeSheets}
                className="flex w-full items-center gap-2 rounded-[3px] px-2 py-1.5 text-left text-sm text-interactive transition-colors hover:bg-brand hover:text-white"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18" />
                  <path d="M3 12h18" />
                  <path d="M3 18h18" />
                </svg>
                Change the Sheets
              </button>
              {channel.name !== 'general' && (
                <button
                  onClick={handleArchive}
                  className="flex w-full items-center gap-2 rounded-[3px] px-2 py-1.5 text-left text-sm text-danger transition-colors hover:bg-danger hover:text-white"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                  Archive Channel
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
