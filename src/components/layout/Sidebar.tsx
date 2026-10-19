import { SpaceList } from '@/components/spaces/SpaceList'
import { UserPanel } from '@/components/user/UserPanel'
import { useUiStore } from '@/stores/uiStore'

export function Sidebar() {
  const { setSidebarOpen } = useUiStore()

  return (
    <aside className="flex h-full flex-col bg-secondary">
      {/* Server header */}
      <button
        className="flex h-[var(--header-height)] w-full items-center border-b border-[hsl(var(--color-bg-tertiary))] px-5 shadow-sm transition-colors hover:bg-hover"
      >
        <h2 className="truncate text-[15px] font-semibold text-primary">Chat</h2>
      </button>

      {/* Space list */}
      <div className="flex-1 overflow-y-auto">
        <SpaceList onSelect={() => setSidebarOpen(false)} />
      </div>

      {/* User panel */}
      <UserPanel />
    </aside>
  )
}
