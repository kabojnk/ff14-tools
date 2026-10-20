import { useEffect, useState } from 'react'
import { spaceKey } from '@/lib/spaces'
import { useConversationStore } from '@/stores/conversationStore'
import { useMessageStore } from '@/stores/messageStore'
import type { Message, Space } from '@/types'

const NO_MESSAGES: Message[] = []

/** Messages of one space. Live updates arrive through the conversation's realtime channel (AppShell). */
export function useMessages(conversationId: string, space: Space) {
  const key = spaceKey(conversationId, space)
  const messages = useMessageStore((s) => s.messages[key]) ?? NO_MESSAGES
  const fetchMessages = useMessageStore((s) => s.fetchMessages)
  const realtimeStatus = useConversationStore((s) => s.realtimeStatus)
  // True once this mount's first fetch has answered (the list then knows where to open).
  const [readyKey, setReadyKey] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    void fetchMessages(conversationId, space).finally(() => {
      if (live) setReadyKey(key)
    })
    return () => {
      live = false
    }
  }, [conversationId, space, key, fetchMessages])

  return {
    messages,
    ready: readyKey === key,
    realtimeStatus,
  }
}
