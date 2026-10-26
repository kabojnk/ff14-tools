import { useEffect } from 'react'
import { joinConversation, sendLake } from '@/lib/conversationRealtime'
import { spaceKey } from '@/lib/spaces'
import { useAuthStore } from '@/stores/authStore'
import { setLakeBroadcaster, useConversationStore } from '@/stores/conversationStore'
import { useMessageStore } from '@/stores/messageStore'
import { useTypingStore } from '@/stores/typingStore'
import { useProfileStore } from '@/stores/profileStore'
import { useReactionStore } from '@/stores/reactionStore'
import { useVoicePlayStore } from '@/stores/voicePlays'
import type { Message } from '@/types'

setLakeBroadcaster(sendLake)

/** Joins the conversation's realtime channel once per device. Mounted only in AppShell. */
export function useConversationRealtime() {
  const conversationId = useConversationStore((s) => s.conversation?.id)
  const myId = useAuthStore((s) => s.user?.id)

  useEffect(() => {
    if (!conversationId || !myId) return
    const conv = useConversationStore.getState
    // Members are loaded together with the conversation, so they're known by the time it joins.
    const memberIds = conv().memberIds
    const profiles = useProfileStore.getState
    void profiles().load(memberIds)

    return joinConversation(conversationId, {
      onMessage(m, kind) {
        const key = spaceKey(conversationId, m.space)
        const store = useMessageStore.getState()
        if (kind === 'new') {
          // Each message arrives twice (broadcast, then the database change), the second copy often
          // after they've started typing their next one.
          const known = (store.messages[key] ?? []).some((x) => x.id === m.id && !x.localState)
          store.addMessage(key, m as Message)
          conv().noteMessage(m as Message)
          // Their message is here, so they've stopped typing (even if the stop broadcast was lost).
          if (!known) useTypingStore.getState().stopTyping(m.space, (m as Message).author_id)
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
      onTypingStop(space, userId) {
        useTypingStore.getState().stopTyping(space, userId)
      },
      onLake() {
        void conv().reloadAfterLake()
      },
      onReadPosition(rp) {
        conv().applyReadPosition(rp, myId)
      },
      onProfile(row) {
        // apply() keeps only the known columns: the realtime row carries lock_pin, which is never stored.
        profiles().apply(row)
      },
      onReaction(event, row) {
        useReactionStore.getState().apply(event, row)
      },
      onVoicePlay(row) {
        useVoicePlayStore.getState().apply(row)
      },
      onStatus(status, rejoined) {
        conv().setRealtimeStatus(status)
        if (status !== 'SUBSCRIBED') return
        // Messages may have been missed while disconnected (or between load() and the first join).
        // Reloading the messages also reloads their reactions (messageStore → reactionStore.loadFor).
        if (rejoined) {
          void conv().reloadAfterLake()
          void profiles().load(memberIds)
        } else void conv().refreshLatest()
        // Read positions travel only as database changes: catch up on any that landed before they were live.
        void conv().refreshPartnerReadAt(myId)
      },
    }, { memberIds })
  }, [conversationId, myId])
}
