import { useEffect, useRef } from 'react'
import { useMessages } from '@/hooks/useMessages'
import { useAuthStore } from '@/stores/authStore'
import { MessageItem } from '@/components/chat/MessageItem'
import { TypingIndicator } from '@/components/chat/TypingIndicator'
import type { Profile } from '@/types'

interface MessageListProps {
  channelId: string
}

// Cache profiles in memory to avoid re-fetching
const profileCache: Record<string, Profile> = {}

export function MessageList({ channelId }: MessageListProps) {
  const { messages, loading, broadcastEditMessage, broadcastDeleteMessage } = useMessages(channelId)
  const { profile } = useAuthStore()
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  // Store the current user's profile in cache
  useEffect(() => {
    if (profile) {
      profileCache[profile.id] = profile
    }
  }, [profile])

  // Fetch missing profiles
  useEffect(() => {
    const missingIds = new Set<string>()
    for (const msg of messages) {
      if (!profileCache[msg.author_id] && !msg.author) {
        missingIds.add(msg.author_id)
      }
    }
    if (missingIds.size > 0) {
      import('@/lib/supabase').then(({ supabase }) => {
        supabase
          .from('profiles')
          .select('*')
          .in('id', Array.from(missingIds))
          .then(({ data }) => {
            if (data) {
              for (const p of data) {
                profileCache[p.id] = p as Profile
              }
            }
          })
      })
    }
  }, [messages])

  const getAuthor = (authorId: string): Profile | null => {
    return profileCache[authorId] ?? null
  }

  // Determine if message should show header (different author or >5 min gap from previous)
  const shouldShowHeader = (index: number): boolean => {
    if (index === 0) return true
    const prev = messages[index - 1]
    const curr = messages[index]
    if (prev.author_id !== curr.author_id) return true
    const gap = new Date(curr.created_at).getTime() - new Date(prev.created_at).getTime()
    return gap > 5 * 60 * 1000 // 5 minutes
  }

  if (loading && messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-muted">Loading messages...</div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="flex flex-1 flex-col overflow-y-auto">
      {/* Spacer to push content to bottom when there aren't many messages */}
      <div className="flex-1" />

      {messages.length === 0 && !loading && (
        <div className="px-4 py-8 text-center">
          <p className="text-lg font-semibold text-primary">Welcome to the channel!</p>
          <p className="mt-1 text-sm text-muted">This is the start of the conversation.</p>
        </div>
      )}

      {messages.map((message, i) => (
        <MessageItem
          key={message.id}
          message={message}
          author={message.author ?? getAuthor(message.author_id)}
          showHeader={shouldShowHeader(i)}
          channelId={channelId}
          onBroadcastEdit={broadcastEditMessage}
          onBroadcastDelete={broadcastDeleteMessage}
        />
      ))}

      {/* Typing indicator */}
      <TypingIndicator channelId={channelId} />

      <div ref={bottomRef} className="h-1" />
    </div>
  )
}
