import { useState } from 'react'
import { useChannelStore } from '@/stores/channelStore'
import { useUiStore } from '@/stores/uiStore'
import { CreateChannelModal } from '@/components/channels/CreateChannelModal'

export function ChannelList() {
  const { channels, activeChannelId, setActiveChannel } = useChannelStore()
  const { setSidebarOpen } = useUiStore()
  const [showCreate, setShowCreate] = useState(false)

  const handleSelectChannel = (channelId: string) => {
    setActiveChannel(channelId)
    // On mobile, close sidebar after selecting
    setSidebarOpen(false)
  }

  return (
    <div className="px-2 py-3">
      {/* Category header */}
      <div className="mb-1 flex items-center justify-between px-1">
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

      {/* Channel items */}
      <div className="space-y-0.5">
        {channels.map((channel) => (
          <button
            key={channel.id}
            onClick={() => handleSelectChannel(channel.id)}
            className={`
              group flex w-full items-center gap-1.5 rounded-[4px] px-2 py-1.5 text-left transition-colors
              ${activeChannelId === channel.id
                ? 'bg-active text-interactive-active'
                : 'text-interactive hover:bg-hover hover:text-interactive-hover'
              }
            `}
          >
            {/* Hash icon */}
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="flex-shrink-0 opacity-60"
            >
              <line x1="4" y1="9" x2="20" y2="9" />
              <line x1="4" y1="15" x2="20" y2="15" />
              <line x1="10" y1="3" x2="8" y2="21" />
              <line x1="16" y1="3" x2="14" y2="21" />
            </svg>
            <span className="truncate text-[15px] leading-5">{channel.name}</span>
          </button>
        ))}
      </div>

      {channels.length === 0 && (
        <p className="px-2 py-4 text-center text-xs text-muted">
          No channels yet. Click + to create one.
        </p>
      )}

      {/* Create channel modal */}
      {showCreate && <CreateChannelModal onClose={() => setShowCreate(false)} />}
    </div>
  )
}
