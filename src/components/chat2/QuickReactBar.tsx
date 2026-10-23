import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { Icon } from '@/components/ui/Icon'
import { EmojiPicker } from '@/components/emoji/EmojiPicker'
import type { EmojiLookup } from '@/components/chat2/Markdown'
import { recentEmoji } from '@/lib/recentEmoji'
import { isDisguised } from '@/stores/uiStore'

const CUSTOM = /^:([\w-]+):$/

/** An emoji, or a custom `:name:` emoji's image when it's known. */
export function EmojiGlyph({ emoji, lookup, size = 16 }: { emoji: string; lookup: EmojiLookup; size?: number }) {
  const name = CUSTOM.exec(emoji)?.[1]
  const url = name ? lookup(name) : undefined
  if (url) {
    return <img src={url} alt={emoji} draggable={false} className="inline-block object-contain" style={{ width: size, height: size }} />
  }
  return <span aria-hidden="true">{emoji}</span>
}

interface QuickReactBarProps {
  onPick: (emoji: string) => void
  onClose: () => void
  emoji: EmojiLookup
  /** Extra classes for positioning. */
  className?: string
  /** A press outside doesn't close it (it sits over a long-press sheet, which closes both). */
  ignoreOutside?: boolean
  /** The layout, for the full picker (popover or bottom panel); otherwise the media query decides. */
  isDesktop?: boolean
}

/**
 * Six recent emoji plus "More emoji" for the full picker (custom emoji included). Closes on Escape or a
 * press outside. While the full picker is open, those are the picker's: Escape or a press outside closes
 * just the picker, and presses inside it (a portal) never count as outside the bar.
 */
export function QuickReactBar({ onPick, onClose, emoji, className = '', ignoreOutside = false, isDesktop }: QuickReactBarProps) {
  const ref = useRef<HTMLDivElement>(null)
  const moreRef = useRef<HTMLButtonElement>(null)
  const [recent] = useState(recentEmoji)
  const [full, setFull] = useState(false)
  const closeFull = useCallback(() => setFull(false), [])

  useEffect(() => {
    if (full) return // paused: the picker handles Escape and outside presses
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (ignoreOutside || isDisguised() || !ref.current || ref.current.contains(t)) return
      if (t instanceof Element && t.closest('[data-emoji-picker]')) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented && !isDisguised()) onClose()
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose, ignoreOutside, full])

  const pick = (e: string) => {
    onPick(e)
    onClose()
  }

  return (
    <div ref={ref} className={`relative z-30 ${className}`}>
      <div
        role="toolbar"
        aria-label="Quick reactions"
        className="flex items-center gap-0.5 rounded-full border border-[color:var(--line)] bg-[color:var(--bar)] p-1 shadow-lg"
      >
        {recent.map((e) => (
          <button
            key={e}
            type="button"
            aria-label={`React with ${e}`}
            onClick={() => pick(e)}
            className="flex h-8 w-8 items-center justify-center rounded-full text-lg transition-transform hover:scale-110 hover:bg-[color:var(--chip)]"
          >
            <EmojiGlyph emoji={e} lookup={emoji} size={20} />
          </button>
        ))}
        <button
          ref={moreRef}
          type="button"
          aria-label="More emoji"
          aria-expanded={full}
          onClick={() => setFull((v) => !v)}
          className="flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--muted)] hover:bg-[color:var(--chip)] hover:text-[color:var(--fg)]"
        >
          <Icon icon={Plus} size={18} />
        </button>
      </div>
      {full && <EmojiPicker mode="reaction" canAddEmoji anchorRef={moreRef} isDesktop={isDesktop} onPick={pick} onClose={closeFull} />}
    </div>
  )
}
