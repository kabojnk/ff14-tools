import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useMessageStore } from '@/stores/messageStore'
import type { Message } from '@/types'
import type { RealtimeChannel } from '@supabase/supabase-js'

export function useMessages(channelId: string) {
  const { messages, loading, fetchMessages, addMessage, updateMessage, removeMessage } = useMessageStore()
  const channelRef = useRef<RealtimeChannel | null>(null)

  useEffect(() => {
    fetchMessages(channelId)

    // Subscribe to broadcast for this channel
    const broadcastChannel = supabase
      .channel(`channel:${channelId}`)
      .on('broadcast', { event: 'new_message' }, ({ payload }) => {
        addMessage(channelId, payload as Message)
      })
      .on('broadcast', { event: 'edit_message' }, ({ payload }) => {
        updateMessage(channelId, payload as Message)
      })
      .on('broadcast', { event: 'delete_message' }, ({ payload }) => {
        removeMessage(channelId, payload.id)
      })
      .subscribe()

    channelRef.current = broadcastChannel

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [channelId, fetchMessages, addMessage, updateMessage, removeMessage])

  // Function to broadcast after sending
  const broadcastNewMessage = (message: Message) => {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'new_message',
      payload: message,
    })
  }

  const broadcastEditMessage = (message: Message) => {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'edit_message',
      payload: message,
    })
  }

  const broadcastDeleteMessage = (messageId: string) => {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'delete_message',
      payload: { id: messageId },
    })
  }

  return {
    messages: messages[channelId] ?? [],
    loading,
    broadcastNewMessage,
    broadcastEditMessage,
    broadcastDeleteMessage,
  }
}
