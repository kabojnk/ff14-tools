import { useTyping } from '@/hooks/useTyping'
import type { Space } from '@/types'

interface TypingIndicatorProps {
  space: Space
}

export function TypingIndicator({ space }: TypingIndicatorProps) {
  const { typingUsers } = useTyping(space)

  if (typingUsers.length === 0) return <div className="h-6" />

  const names = typingUsers.map((u) => u.nickname)
  let text: string

  if (names.length === 1) {
    text = `${names[0]} is typing`
  } else {
    text = `${names.join(' and ')} are typing`
  }

  return (
    <div className="flex h-6 items-center gap-1 px-4 text-xs text-muted">
      {/* Animated dots */}
      <span className="inline-flex gap-0.5">
        <span className="animate-bounce text-[10px]" style={{ animationDelay: '0ms' }}>&bull;</span>
        <span className="animate-bounce text-[10px]" style={{ animationDelay: '150ms' }}>&bull;</span>
        <span className="animate-bounce text-[10px]" style={{ animationDelay: '300ms' }}>&bull;</span>
      </span>
      <span className="font-medium">{text}</span>
    </div>
  )
}
