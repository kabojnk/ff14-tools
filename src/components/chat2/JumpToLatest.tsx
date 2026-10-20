import { ChevronDown } from 'lucide-react'
import { Icon } from '@/components/ui/Icon'

interface JumpToLatestProps {
  /** Messages below the viewport you haven't seen. */
  count: number
  onClick: () => void
}

/** The round button above the composer while you're scrolled up more than a screen. */
export function JumpToLatest({ count, onClick }: JumpToLatestProps) {
  const label = count > 0 ? `Jump to latest, ${count} new message${count === 1 ? '' : 's'}` : 'Jump to latest'
  return (
    <button
      type="button"
      data-jump-to-latest
      aria-label={label}
      onClick={onClick}
      className="msg-in relative flex h-10 w-10 items-center justify-center rounded-full border border-[color:var(--line)] bg-[color:var(--bar)] text-[color:var(--fg)] shadow-[0_2px_8px_var(--shadow)]"
    >
      <Icon icon={ChevronDown} size={22} />
      {count > 0 && (
        <span
          data-count
          aria-hidden="true"
          className="absolute -top-2 left-1/2 min-w-5 -translate-x-1/2 rounded-full bg-[color:var(--accent)] px-1.5 text-center text-[11px] font-bold leading-5 text-[color:var(--on-accent)]"
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  )
}
