import { useEffect } from 'react'
import { sendMessageEvent } from '@/lib/conversationRealtime'
import { spaceKey } from '@/lib/spaces'
import { useConversationStore } from '@/stores/conversationStore'
import { useMessageStore } from '@/stores/messageStore'
import type { Message, Space } from '@/types'

const NO_MESSAGES: Message[] = []

/** Messages of one space. Live updates arrive through the conversation's realtime channel (AppShell). */
export function useMessages(conversationId: string, space: Space) {
  const key = spaceKey(conversationId, space)
  const messages = useMessageStore((s) => s.messages[key]) ?? NO_MESSAGES
  const loading = useMessageStore((s) => s.loading)
  const fetchMessages = useMessageStore((s) => s.fetchMessages)
  const realtimeStatus = useConversationStore((s) => s.realtimeStatus)

  useEffect(() => {
    fetchMessages(conversationId, space)
  }, [conversationId, space, fetchMessages])

  return {
    messages,
    loading,
    realtimeStatus,
    broadcastEditMessage: (message: Message) => sendMessageEvent('edit', message),
    broadcastDeleteMessage: (messageId: string) => sendMessageEvent('delete', { id: messageId, space }),
  }
}
