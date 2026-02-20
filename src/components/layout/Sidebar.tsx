import { ChannelList } from '@/components/channels/ChannelList'
import { UserPanel } from '@/components/user/UserPanel'

export function Sidebar() {
  return (
    <aside className="flex h-full flex-col bg-secondary">
      {/* Server header */}
      <button
        className="flex h-[var(--header-height)] w-full items-center border-b border-[hsl(var(--color-bg-tertiary))] px-5 shadow-sm transition-colors hover:bg-hover"
      >
        <h2 className="truncate text-[15px] font-semibold text-primary">Chat</h2>
      </button>

      {/* Channel list */}
      <div className="flex-1 overflow-y-auto">
        <ChannelList />
      </div>

      {/* User panel */}
      <UserPanel />
    </aside>
  )
}
