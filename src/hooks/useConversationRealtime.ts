import { useEffect } from 'react'
import { joinConversation, sendLake } from '@/lib/conversationRealtime'
import { spaceKey } from '@/lib/spaces'
import { useAuthStore } from '@/stores/authStore'
import { setLakeBroadcaster, useConversationStore } from '@/stores/conversationStore'
import { useMessageStore } from '@/stores/messageStore'
import { useTypingStore } from '@/stores/typingStore'
import type { Message } from '@/types'

setLakeBroadcaster(sendLake)

/** Joins the conversation's realtime channel once per device. Mounted only in AppShell. */
export function useConversationRealtime() {
  const conversationId = useConversationStore((s) => s.conversation?.id)
  const myId = useAuthStore((s) => s.user?.id)

  useEffect(() => {
    if (!conversationId || !myId) return
    const conv = useConversationStore.getState

    return joinConversation(conversationId, {
      onMessage(m, kind) {
        const key = spaceKey(conversationId, m.space)
        const store = useMessageStore.getState()
        if (kind === 'new') {
          store.addMessage(key, m as Message)
          conv().noteMessage(m as Message)
        } else if (kind === 'edit') {
          store.updateMessage(key, m as Message)
        } else {
          const list = store.messages[key] ?? []
          const latestAt = conv().latest[m.space]?.at
          const wasNewest = list[list.length - 1]?.id === m.id || (!!m.created_at && m.created_at === latestAt)
          store.removeMessage(key, m.id)
          // A deleted newest message must not leave the space unread forever.
          if (wasNewest) void conv().refreshLatest()
        }
      },
      onTyping(space, user) {
        if (user.user_id !== myId) useTypingStore.getState().noteTyping(space, user)
      },
      onLake() {
        void conv().reloadAfterLake()
      },
      onReadPosition(rp) {
        conv().applyReadPosition(rp, myId)
      },
      onStatus(status, rejoined) {
        conv().setRealtimeStatus(status)
        if (status !== 'SUBSCRIBED') return
        // Messages may have been missed while disconnected (or between load() and the first join).
        if (rejoined) void conv().reloadAfterLake()
        else void conv().refreshLatest()
      },
    })
  }, [conversationId, myId])
}
