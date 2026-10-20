import { useRef, useEffect } from 'react'

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
    <div ref={ref} className="flex rounded bg-floating p-1 shadow-lg border border-[color:var(--line)]">
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
