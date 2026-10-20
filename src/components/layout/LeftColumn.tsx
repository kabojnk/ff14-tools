import { Search } from 'lucide-react'
import { Icon } from '@/components/ui/Icon'
import { MeRow } from '@/components/layout/MeRow'
import { ConversationList } from '@/components/layout/ConversationList'

interface LeftColumnProps {
  /** Opens message search in the right-hand slide-over. */
  onSearch: () => void
}

/** Desktop left column (240 px): you, "Search messages", and the conversation list. */
export function LeftColumn({ onSearch }: LeftColumnProps) {
  return (
    <aside className="flex w-[240px] flex-none flex-col border-r border-[color:var(--line)] bg-[color:var(--bar)]">
      <MeRow />
      <button
        type="button"
        onClick={onSearch}
        className="mx-3 my-2.5 flex h-8 items-center gap-2 rounded-lg border border-[color:var(--line)] bg-[color:var(--field)] px-2.5 text-left text-[12.5px] text-[color:var(--muted)] transition-colors hover:text-[color:var(--fg)]"
      >
        <Icon icon={Search} size={15} />
        Search messages
      </button>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <ConversationList activeHighlight />
      </div>
    </aside>
  )
}
