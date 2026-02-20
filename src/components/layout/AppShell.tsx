import { useEffect, useRef } from 'react'
import { useChannelStore } from '@/stores/channelStore'
import { useUiStore } from '@/stores/uiStore'
import { usePresence } from '@/hooks/usePresence'
import { Sidebar } from '@/components/layout/Sidebar'
import { ChannelHeader } from '@/components/channels/ChannelHeader'
import { MessageList } from '@/components/chat/MessageList'
import { MessageInput } from '@/components/chat/MessageInput'
import { MemberList } from '@/components/user/MemberList'

export function AppShell() {
  const { setEepMode, sidebarOpen, setSidebarOpen, memberListOpen } = useUiStore()
  const { fetchChannels, activeChannelId, channels } = useChannelStore()

  // Initialize presence tracking (online/away/offline)
  usePresence()

  useEffect(() => {
    fetchChannels()
  }, [fetchChannels])

  const activeChannel = channels.find((c) => c.id === activeChannelId) ?? null

  return (
    <div className="flex h-full">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`
          fixed inset-y-0 left-0 z-30 w-[var(--sidebar-width)] transform transition-transform md:relative md:translate-x-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <Sidebar />
      </div>

      {/* Main content */}
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
              <p className="mt-1 text-sm">Select or create a channel to start chatting.</p>
            </div>
          </div>
        )}
      </main>

      {/* Member list */}
      {memberListOpen && (
        <div className="hidden border-l border-[hsl(var(--color-bg-tertiary))] md:block">
          <MemberList />
        </div>
      )}

      {/* Eep! keyboard shortcut listener */}
      <EepShortcutListener onActivate={() => setEepMode(true)} />
    </div>
  )
}

function EepShortcutListener({ onActivate }: { onActivate: () => void }) {
  const lastEscapeRef = useRef(0)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Shift+E
      if (e.ctrlKey && e.shiftKey && e.key === 'E') {
        e.preventDefault()
        onActivate()
        return
      }

      // Double-tap Escape
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
