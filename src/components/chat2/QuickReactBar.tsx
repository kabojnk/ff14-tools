import { useEffect, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { Icon } from '@/components/ui/Icon'
import { EmojiPicker } from '@/components/chat/EmojiPicker'
import type { EmojiLookup } from '@/components/chat2/Markdown'
import { recentEmoji } from '@/lib/recentEmoji'

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
  /** Which edge the full picker lines up with: the bubble's side. */
  align?: 'start' | 'end'
  /** Extra classes for positioning. */
  className?: string
}

/** Six recent emoji plus "+" for the full picker (custom emoji included). Closes on Escape or a press outside. */
export function QuickReactBar({ onPick, onClose, emoji, align = 'start', className = '' }: QuickReactBarProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [recent] = useState(recentEmoji)
  const [full, setFull] = useState(false)

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

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
          type="button"
          aria-label="More emoji"
          aria-expanded={full}
          onClick={() => setFull((v) => !v)}
          className="flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--muted)] hover:bg-[color:var(--chip)] hover:text-[color:var(--fg)]"
        >
          <Icon icon={Plus} size={18} />
        </button>
      </div>
      {full && (
        // EmojiPicker places itself above its parent's right edge; this box puts that edge on the bubble's side.
        <div className={`absolute bottom-full h-0 w-80 max-w-[calc(100vw-32px)] ${align === 'end' ? 'right-0' : 'left-0'}`}>
          <EmojiPicker onSelect={pick} onClose={() => setFull(false)} />
        </div>
      )}
    </div>
  )
}
