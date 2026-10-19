import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useMessageStore } from '@/stores/messageStore'
import type { Message } from '@/types'
import type { RealtimeChannel } from '@supabase/supabase-js'

export function useMessages(channelId: string) {
  const { messages, loading, fetchMessages, addMessage, updateMessage, removeMessage } = useMessageStore()
  const channelRef = useRef<RealtimeChannel | null>(null)
  const [realtimeStatus, setRealtimeStatus] = useState<string>('CLOSED')

  useEffect(() => {
    let active = true
    let joinedBefore = false
    setRealtimeStatus('JOINING')
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
      .subscribe((status) => {
        if (!active) return // late callback from a channel this effect already removed
        setRealtimeStatus(status)
        if (status === 'SUBSCRIBED') {
          // A re-join means we may have missed broadcasts while disconnected; backfill.
          if (joinedBefore) fetchMessages(channelId)
          joinedBefore = true
        }
      })

    channelRef.current = broadcastChannel

    return () => {
      active = false
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
    realtimeStatus,
    broadcastNewMessage,
    broadcastEditMessage,
    broadcastDeleteMessage,
  }
}
