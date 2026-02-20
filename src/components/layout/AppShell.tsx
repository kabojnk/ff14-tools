import { useEffect, useRef, useState } from 'react'
import { useChannelStore } from '@/stores/channelStore'
import { useUiStore } from '@/stores/uiStore'
import { usePresence } from '@/hooks/usePresence'
import { Sidebar } from '@/components/layout/Sidebar'
import { ChannelHeader } from '@/components/channels/ChannelHeader'
import { MessageList } from '@/components/chat/MessageList'
import { MessageInput } from '@/components/chat/MessageInput'
import { MemberList } from '@/components/user/MemberList'
import { CreateChannelModal } from '@/components/channels/CreateChannelModal'
import { UserPanel } from '@/components/user/UserPanel'

// Mobile views — mutually exclusive full-screen panels
type MobileView = 'channels' | 'chat' | 'members'

export function AppShell() {
  const { setEepMode, memberListOpen } = useUiStore()
  const { fetchChannels, activeChannelId, channels, setActiveChannel } = useChannelStore()
  const [mobileView, setMobileView] = useState<MobileView>('channels')

  usePresence()

  useEffect(() => {
    fetchChannels()
  }, [fetchChannels])

  const activeChannel = channels.find((c) => c.id === activeChannelId) ?? null

  // Tapping a channel on mobile navigates straight to chat
  const handleMobileChannelSelect = (channelId: string) => {
    setActiveChannel(channelId)
    setMobileView('chat')
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">

      {/* ── md+ layout: sidebar | chat | member-list ── */}
      <div className="hidden flex-1 overflow-hidden md:flex">

        {/* Left sidebar — always visible on md+ */}
        <div className="w-[var(--sidebar-width)] flex-shrink-0 border-r border-[hsl(var(--color-bg-tertiary))]">
          <Sidebar />
        </div>

        {/* Chat area */}
        <main className="flex flex-1 flex-col overflow-hidden bg-primary">
          {activeChannel ? (
            <>
              <ChannelHeader channel={activeChannel} />
              <MessageList channelId={activeChannel.id} />
              <MessageInput channel={activeChannel} />
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center text-muted">
                <p className="text-lg font-semibold">No channel selected</p>
                <p className="mt-1 text-sm">Select a channel to start chatting.</p>
              </div>
            </div>
          )}
        </main>

        {/* Right member list — toggled via header button */}
        {memberListOpen && (
          <div className="border-l border-[hsl(var(--color-bg-tertiary))]">
            <MemberList />
          </div>
        )}
      </div>

      {/* ── Mobile layout: full-screen views + bottom tab bar ── */}
      <div className="flex flex-1 flex-col overflow-hidden md:hidden">

        {/* Channels panel */}
        {mobileView === 'channels' && (
          <div className="flex h-full flex-col bg-secondary">
            <div className="flex h-[var(--header-height)] flex-shrink-0 items-center border-b border-[hsl(var(--color-bg-tertiary))] px-5 shadow-sm">
              <h2 className="text-[15px] font-semibold text-primary">Channels</h2>
            </div>
            <div className="flex-1 overflow-y-auto">
              <MobileChannelList onSelect={handleMobileChannelSelect} />
            </div>
            {/* User panel at bottom — gives access to status & settings on mobile */}
            <UserPanel />
          </div>
        )}

        {/* Chat panel */}
        {mobileView === 'chat' && (
          <main className="flex h-full flex-col overflow-hidden bg-primary">
            {activeChannel ? (
              <>
                <ChannelHeader
                  channel={activeChannel}
                  mobileBack={() => setMobileView('channels')}
                />
                <MessageList channelId={activeChannel.id} />
                <MessageInput channel={activeChannel} />
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center">
                <p className="text-sm text-muted">Select a channel first.</p>
              </div>
            )}
          </main>
        )}

        {/* Members panel */}
        {mobileView === 'members' && (
          <div className="flex h-full flex-col bg-secondary">
            <div className="flex h-[var(--header-height)] flex-shrink-0 items-center border-b border-[hsl(var(--color-bg-tertiary))] px-5 shadow-sm">
              <h2 className="text-[15px] font-semibold text-primary">Members</h2>
            </div>
            <div className="flex-1 overflow-y-auto">
              <MemberList />
            </div>
          </div>
        )}

        {/* Bottom tab bar */}
        <MobileTabBar
          active={mobileView}
          onChange={setMobileView}
          hasChannel={!!activeChannel}
        />
      </div>

      <EepShortcutListener onActivate={() => setEepMode(true)} />
    </div>
  )
}

// ── Mobile channel list ──
function MobileChannelList({ onSelect }: { onSelect: (id: string) => void }) {
  const { channels, activeChannelId } = useChannelStore()
  const [showCreate, setShowCreate] = useState(false)

  return (
    <div className="px-3 py-3">
      <div className="mb-1 flex items-center justify-between px-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          Text Channels
        </span>
        <button
          onClick={() => setShowCreate(true)}
          className="rounded text-muted transition-colors hover:text-interactive-hover"
          title="Create Channel"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      <div className="space-y-0.5">
        {channels.map((channel) => (
          <button
            key={channel.id}
            onClick={() => onSelect(channel.id)}
            className={`
              flex w-full items-center gap-1.5 rounded-[4px] px-2.5 py-2.5 text-left transition-colors
              ${activeChannelId === channel.id
                ? 'bg-active text-interactive-active'
                : 'text-interactive hover:bg-hover hover:text-interactive-hover'
              }
            `}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 opacity-60">
              <line x1="4" y1="9" x2="20" y2="9" />
              <line x1="4" y1="15" x2="20" y2="15" />
              <line x1="10" y1="3" x2="8" y2="21" />
              <line x1="16" y1="3" x2="14" y2="21" />
            </svg>
            <span className="flex-1 truncate text-[15px] leading-5">{channel.name}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 opacity-30">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        ))}
      </div>

      {channels.length === 0 && (
        <p className="px-2 py-4 text-center text-xs text-muted">No channels yet.</p>
      )}

      {showCreate && <CreateChannelModal onClose={() => setShowCreate(false)} />}
    </div>
  )
}

// ── Bottom tab bar ──
function MobileTabBar({
  active,
  onChange,
  hasChannel,
}: {
  active: MobileView
  onChange: (v: MobileView) => void
  hasChannel: boolean
}) {
  return (
    <nav className="flex flex-shrink-0 border-t border-[hsl(var(--color-bg-tertiary))] bg-secondary pb-safe">
      <TabButton
        label="Channels"
        active={active === 'channels'}
        onClick={() => onChange('channels')}
        icon={
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="4" y1="9" x2="20" y2="9" />
            <line x1="4" y1="15" x2="20" y2="15" />
            <line x1="10" y1="3" x2="8" y2="21" />
            <line x1="16" y1="3" x2="14" y2="21" />
          </svg>
        }
      />
      <TabButton
        label="Chat"
        active={active === 'chat'}
        onClick={() => onChange('chat')}
        disabled={!hasChannel}
        icon={
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        }
      />
      <TabButton
        label="Members"
        active={active === 'members'}
        onClick={() => onChange('members')}
        icon={
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="9" cy="7" r="4" />
            <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            <path d="M21 21v-2a4 4 0 0 0-3-3.85" />
          </svg>
        }
      />
    </nav>
  )
}

function TabButton({
  label,
  icon,
  active,
  onClick,
  disabled = false,
}: {
  label: string
  icon: React.ReactNode
  active: boolean
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        flex flex-1 flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-semibold uppercase tracking-wide transition-colors
        ${active ? 'text-interactive-hover' : 'text-interactive'}
        ${disabled ? 'pointer-events-none opacity-30' : 'hover:text-interactive-hover'}
      `}
    >
      {icon}
      {label}
    </button>
  )
}

function EepShortcutListener({ onActivate }: { onActivate: () => void }) {
  const lastEscapeRef = useRef(0)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'E') {
        e.preventDefault()
        onActivate()
        return
      }
      if (e.key === 'Escape') {
        const now = Date.now()
        if (now - lastEscapeRef.current < 500) {
          onActivate()
          lastEscapeRef.current = 0
        } else {
          lastEscapeRef.current = now
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onActivate])

  return null
}
