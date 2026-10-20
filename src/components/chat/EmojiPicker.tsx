import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { CustomEmoji } from '@/types'

interface EmojiPickerProps {
  onSelect: (emoji: string) => void
  onClose: () => void
}

// Common emoji categories for a lightweight picker
// In production, this would use emoji-mart library
const EMOJI_CATEGORIES = {
  'Smileys': ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '🥲', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🫡', '🤐', '🤨', '😐', '😑', '😶', '🫥', '😏', '😒', '🙄', '😬', '🤥'],
  'Hearts': ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❤️‍🔥', '💕', '💞', '💓', '💗', '💖', '💘', '💝'],
  'Hands': ['👍', '👎', '👊', '✊', '🤛', '🤜', '👏', '🙌', '🫶', '👐', '🤲', '🤝', '🙏', '✌️', '🤞', '🫰', '🤟', '🤘', '👌', '🤌', '🤏', '👈', '👉', '👆', '👇', '☝️', '✋', '🤚', '🖐️', '🖖', '👋', '🤙', '💪'],
  'Objects': ['🎮', '🎲', '🎯', '🎪', '🎭', '🎨', '🎧', '🎤', '🎸', '🎹', '🥁', '🎺', '🎷', '🪗', '🎻', '🎬', '🏆', '🥇', '🥈', '🥉', '⚽', '🏈', '🎾', '🏐', '🎱'],
  'Symbols': ['💯', '❗', '❓', '‼️', '⁉️', '💢', '💬', '👁️‍🗨️', '🗯️', '💭', '💤', '✨', '🔥', '💫', '⭐', '🌟', '🎉', '🎊', '🎈'],
}

export function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  const [activeCategory, setActiveCategory] = useState('Smileys')
  const [customEmojis, setCustomEmojis] = useState<CustomEmoji[]>([])
  const [search, setSearch] = useState('')
  const pickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Load custom emoji
    supabase
      .from('custom_emoji')
      .select('*')
      .order('name')
      .then(({ data }) => {
        if (data) setCustomEmojis(data as CustomEmoji[])
      })
  }, [])

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  const allEmojis = search
    ? Object.values(EMOJI_CATEGORIES).flat().filter(() => true) // Simple search not possible with native emoji — show all
    : EMOJI_CATEGORIES[activeCategory as keyof typeof EMOJI_CATEGORIES] ?? []

  return (
    <div
      ref={pickerRef}
      className="absolute bottom-full right-0 mb-2 w-80 rounded-lg bg-floating shadow-xl border border-[color:var(--line)]"
    >
      {/* Search */}
      <div className="p-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search emoji"
          className="w-full rounded bg-input px-2 py-1.5 text-sm text-primary outline-none placeholder:text-muted"
          autoFocus
        />
      </div>

      {/* Category tabs */}
      <div className="flex gap-1 border-b border-[color:var(--line)] px-2 pb-1">
        {Object.keys(EMOJI_CATEGORIES).map((cat) => (
          <button
            key={cat}
            onClick={() => { setActiveCategory(cat); setSearch('') }}
            className={`rounded px-1.5 py-0.5 text-[11px] ${
              activeCategory === cat && !search ? 'bg-active text-primary' : 'text-muted hover:text-secondary'
            }`}
          >
            {cat}
          </button>
        ))}
        {customEmojis.length > 0 && (
          <button
            onClick={() => { setActiveCategory('Custom'); setSearch('') }}
            className={`rounded px-1.5 py-0.5 text-[11px] ${
              activeCategory === 'Custom' && !search ? 'bg-active text-primary' : 'text-muted hover:text-secondary'
            }`}
          >
            Custom
          </button>
        )}
      </div>

      {/* Emoji grid */}
      <div className="h-48 overflow-y-auto p-2">
        <div className="grid grid-cols-8 gap-0.5">
          {activeCategory === 'Custom' ? (
            customEmojis.map((emoji) => (
              <button
                key={emoji.id}
                onClick={() => onSelect(`:${emoji.name}:`)}
                className="flex h-8 w-8 items-center justify-center rounded hover:bg-hover"
                title={`:${emoji.name}:`}
              >
                <img src={emoji.image_url} alt={emoji.name} className="h-6 w-6 object-contain" />
              </button>
            ))
          ) : (
            allEmojis.map((emoji, i) => (
              <button
                key={i}
                onClick={() => onSelect(emoji)}
                className="flex h-8 w-8 items-center justify-center rounded text-xl hover:bg-hover"
              >
                {emoji}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
