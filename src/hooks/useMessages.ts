import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useMessageStore } from '@/stores/messageStore'
import type { Message } from '@/types'
import type { RealtimeChannel } from '@supabase/supabase-js'

// Joined broadcast channels by app channel id, so the composer can announce new messages.
const broadcastChannels = new Map<string, RealtimeChannel>()

export function broadcastNewMessage(channelId: string, message: Message) {
  broadcastChannels.get(channelId)?.send({
    type: 'broadcast',
    event: 'new_message',
    payload: message,
  })
}

export function useMessages(channelId: string) {
  const { messages, loading, fetchChannelMessages, addMessage, updateMessage, removeMessage } = useMessageStore()
  const channelRef = useRef<RealtimeChannel | null>(null)
  const [realtimeStatus, setRealtimeStatus] = useState<string>('CLOSED')

  useEffect(() => {
    let active = true
    let joinedBefore = false
    setRealtimeStatus('JOINING')
    fetchChannelMessages(channelId)

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
          if (joinedBefore) fetchChannelMessages(channelId)
          joinedBefore = true
        }
      })

    channelRef.current = broadcastChannel
    broadcastChannels.set(channelId, broadcastChannel)

    return () => {
      active = false
      if (channelRef.current) {
        if (broadcastChannels.get(channelId) === channelRef.current) broadcastChannels.delete(channelId)
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [channelId, fetchChannelMessages, addMessage, updateMessage, removeMessage])

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
    broadcastEditMessage,
    broadcastDeleteMessage,
  }
}
