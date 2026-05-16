import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'

export function usePinnedMessages(channelId: string) {
  const { user } = useAuthStore()
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!channelId) return

    supabase
      .from('pinned_messages')
      .select('message_id')
      .eq('channel_id', channelId)
      .then(({ data }) => {
        if (data) setPinnedIds(new Set(data.map((p: { message_id: string }) => p.message_id)))
      })

    const ch = supabase
      .channel(`pins:${channelId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'pinned_messages', filter: `channel_id=eq.${channelId}` },
        (payload) => {
          setPinnedIds((prev) => new Set([...prev, (payload.new as { message_id: string }).message_id]))
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'pinned_messages', filter: `channel_id=eq.${channelId}` },
        (payload) => {
          setPinnedIds((prev) => {
            const next = new Set(prev)
            next.delete((payload.old as { message_id: string }).message_id)
            return next
          })
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [channelId])

  const pinMessage = async (messageId: string) => {
    if (!user) return
    await supabase.from('pinned_messages').insert({
      channel_id: channelId,
      message_id: messageId,
      pinned_by: user.id,
    })
  }

  const unpinMessage = async (messageId: string) => {
    await supabase
      .from('pinned_messages')
      .delete()
      .eq('channel_id', channelId)
      .eq('message_id', messageId)
  }

  return { pinnedIds, pinMessage, unpinMessage }
}
