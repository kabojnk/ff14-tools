import { useRef, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import type { Reaction } from '@/types'

interface ReactionPickerProps {
  messageId: string
  onClose: () => void
}

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '👀', '✅']

export function ReactionPicker({ messageId, onClose }: ReactionPickerProps) {
  const { user } = useAuthStore()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  const handleReact = async (emoji: string) => {
    if (!user) return
    await supabase.from('reactions').insert({
      message_id: messageId,
      user_id: user.id,
      emoji,
    })
    onClose()
  }

  return (
    <div ref={ref} className="flex rounded bg-floating p-1 shadow-lg border border-[hsl(var(--color-input-border))]">
      {QUICK_REACTIONS.map((emoji) => (
        <button
          key={emoji}
          onClick={() => handleReact(emoji)}
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
}

export function ReactionDisplay({ reactions, messageId }: ReactionDisplayProps) {
  const { user } = useAuthStore()

  if (reactions.length === 0) return null

  // Group by emoji
  const grouped = reactions.reduce<Record<string, { count: number; hasOwn: boolean; users: string[] }>>((acc, r) => {
    if (!acc[r.emoji]) acc[r.emoji] = { count: 0, hasOwn: false, users: [] }
    acc[r.emoji].count++
    acc[r.emoji].users.push(r.user_id)
    if (r.user_id === user?.id) acc[r.emoji].hasOwn = true
    return acc
  }, {})

  const toggleReaction = async (emoji: string) => {
    if (!user) return
    const group = grouped[emoji]
    if (group?.hasOwn) {
      // Remove own reaction
      await supabase
        .from('reactions')
        .delete()
        .eq('message_id', messageId)
        .eq('user_id', user.id)
        .eq('emoji', emoji)
    } else {
      // Add reaction
      await supabase.from('reactions').insert({
        message_id: messageId,
        user_id: user.id,
        emoji,
      })
    }
  }

  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {Object.entries(grouped).map(([emoji, { count, hasOwn }]) => (
        <button
          key={emoji}
          onClick={() => toggleReaction(emoji)}
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
