import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { EllipsisVertical, Image, Pin, Search, Waves, type LucideIcon } from 'lucide-react'
import { Icon } from '@/components/ui/Icon'

interface ChatMenuProps {
  onSearch: () => void
  onMedia: () => void
  onPins: () => void
  onDragTheLake: () => void
}

type Item = { label: string; icon: LucideIcon; run: () => void; danger?: boolean }

/**
 * The header's ⋮ menu: Search messages, Media, files & links, Pinned messages, then Drag the Lake in red.
 * Keyboard navigable; closes on Escape and on a click outside. Escape is not swallowed, so Esc Esc
 * still shows the disguise while the menu is open.
 */
export function ChatMenu({ onSearch, onMedia, onPins, onDragTheLake }: ChatMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

  const items: Item[] = [
    { label: 'Search messages', icon: Search, run: onSearch },
    { label: 'Media, files & links', icon: Image, run: onMedia },
    { label: 'Pinned messages', icon: Pin, run: onPins },
    { label: 'Drag the Lake', icon: Waves, run: onDragTheLake, danger: true },
  ]

  useEffect(() => {
    if (!open) return
    itemRefs.current[0]?.focus()
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const focusItem = (index: number) => {
    const n = items.length
    itemRefs.current[((index % n) + n) % n]?.focus()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const current = itemRefs.current.findIndex((el) => el === document.activeElement)
    if (e.key === 'ArrowDown') focusItem(current + 1)
    else if (e.key === 'ArrowUp') focusItem(current < 0 ? -1 : current - 1)
    else if (e.key === 'Home') focusItem(0)
    else if (e.key === 'End') focusItem(items.length - 1)
    else if (e.key === 'Escape') {
      setOpen(false)
      triggerRef.current?.focus()
      return
    } else if (e.key === 'Tab') {
      setOpen(false)
      return
    } else return
    e.preventDefault()
  }

  const choose = (item: Item) => {
    setOpen(false)
    item.run()
  }

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        ref={triggerRef}
        type="button"
        aria-label="More"
        title="More"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`rounded-full p-1.5 transition-colors hover:bg-[color:var(--seg)] hover:text-[color:var(--fg)] ${
          open ? 'text-[color:var(--fg)]' : 'text-[color:var(--muted)]'
        }`}
      >
        <Icon icon={EllipsisVertical} />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="More"
          onKeyDown={onKeyDown}
          className="absolute right-[-6px] top-[calc(100%+4px)] z-50 flex min-w-[210px] flex-col rounded-[10px] border border-[color:var(--line)] bg-[color:var(--bar)] p-1.5 text-[13px] text-[color:var(--fg)] shadow-[0_10px_30px_var(--shadow),0_2px_6px_var(--shadow)]"
        >
          {items.map((item, i) => (
            <div key={item.label} className="contents">
              {item.danger && <div role="separator" className="mx-0.5 my-1 h-px bg-[color:var(--line)]" />}
              <button
                ref={(el) => {
                  itemRefs.current[i] = el
                }}
                type="button"
                role="menuitem"
                tabIndex={-1}
                onClick={() => choose(item)}
                className={`flex items-center gap-2.5 rounded-md px-2 py-[7px] text-left outline-none transition-colors hover:bg-[color:var(--seg)] focus-visible:bg-[color:var(--seg)] focus:bg-[color:var(--seg)] ${
                  item.danger ? 'text-[color:var(--danger)]' : ''
                }`}
              >
                <Icon icon={item.icon} size={16} className={item.danger ? '' : 'text-[color:var(--muted)]'} />
                {item.label}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
