import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'

// realtime-js shares channels by topic, so each hook instance gets its own topic.
let instance = 0

/** Pinned message IDs for the whole conversation (callers filter by space). */
export function usePinnedMessages(conversationId: string) {
  const { user } = useAuthStore()
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!conversationId) return
    let active = true

    supabase
      .from('pinned_messages')
      .select('message_id')
      .eq('conversation_id', conversationId)
      .order('pinned_at', { ascending: false })
      .then(({ data }) => {
        if (active && data) setPinnedIds(new Set(data.map((p: { message_id: string }) => p.message_id)))
      })

    const filter = `conversation_id=eq.${conversationId}`
    const ch = supabase
      .channel(`pins:${conversationId}:${++instance}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pinned_messages', filter }, (payload) => {
        setPinnedIds((prev) => new Set([...prev, (payload.new as { message_id: string }).message_id]))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'pinned_messages', filter }, (payload) => {
        setPinnedIds((prev) => {
          const next = new Set(prev)
          next.delete((payload.old as { message_id: string }).message_id)
          return next
        })
      })
      .subscribe()

    return () => {
      active = false
      supabase.removeChannel(ch)
    }
  }, [conversationId])

  const pinMessage = async (messageId: string) => {
    if (!user) return
    setPinnedIds((prev) => new Set([...prev, messageId]))
    await supabase.from('pinned_messages').insert({
      conversation_id: conversationId,
      message_id: messageId,
      pinned_by: user.id,
    })
  }

  const unpinMessage = async (messageId: string) => {
    setPinnedIds((prev) => {
      const next = new Set(prev)
      next.delete(messageId)
      return next
    })
    await supabase.from('pinned_messages').delete().eq('conversation_id', conversationId).eq('message_id', messageId)
  }

  return { pinnedIds, pinMessage, unpinMessage }
}
