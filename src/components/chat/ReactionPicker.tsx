import { useRef, useEffect } from 'react'
import { useAuthStore } from '@/stores/authStore'
import type { Reaction } from '@/types'

interface ReactionPickerProps {
  messageId: string
  onAdd: (emoji: string) => void
  onClose: () => void
}

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '👀', '✅']

export function ReactionPicker({ onAdd, onClose }: ReactionPickerProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  return (
    <div ref={ref} className="flex rounded bg-floating p-1 shadow-lg border border-[hsl(var(--color-input-border))]">
      {QUICK_REACTIONS.map((emoji) => (
        <button
          key={emoji}
          onClick={() => { onAdd(emoji); onClose() }}
          className="flex h-8 w-8 items-center justify-center rounded text-lg hover:bg-hover"
        >
          {emoji}
        </button>
      ))}
    </div>
  )
}

// Display reactions on a message
interface ReactionDisplayProps {
  reactions: Reaction[]
  messageId: string
  onAdd: (emoji: string) => void
  onRemove: (emoji: string) => void
}

export function ReactionDisplay({ reactions, onAdd, onRemove }: ReactionDisplayProps) {
  const { user } = useAuthStore()

  if (reactions.length === 0) return null

  // Group by emoji
  const grouped = reactions.reduce<Record<string, { count: number; hasOwn: boolean }>>((acc, r) => {
    if (!acc[r.emoji]) acc[r.emoji] = { count: 0, hasOwn: false }
    acc[r.emoji].count++
    if (r.user_id === user?.id) acc[r.emoji].hasOwn = true
    return acc
  }, {})

  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {Object.entries(grouped).map(([emoji, { count, hasOwn }]) => (
        <button
          key={emoji}
          onClick={() => hasOwn ? onRemove(emoji) : onAdd(emoji)}
          className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs transition-colors ${
            hasOwn
              ? 'border-[hsl(var(--color-brand))] bg-[hsl(var(--color-brand)/.15)]'
              : 'border-[hsl(var(--color-input-border))] bg-secondary hover:border-[hsl(var(--color-interactive-normal))]'
          }`}
        >
          <span className="text-sm">{emoji}</span>
          <span className={hasOwn ? 'text-brand' : 'text-muted'}>{count}</span>
        </button>
      ))}
    </div>
  )
}
