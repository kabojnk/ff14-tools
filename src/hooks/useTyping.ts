import { useCallback, useEffect, useRef } from 'react'
import { sendTyping as broadcastTyping, sendTypingStop as broadcastTypingStop } from '@/lib/conversationRealtime'
import { useAuthStore } from '@/stores/authStore'
import { useTypingStore } from '@/stores/typingStore'
import type { Space } from '@/types'

const TYPING_THROTTLE = 3000 // Send typing event at most every 3 seconds

export function useTyping(space: Space) {
  const { user, profile } = useAuthStore()
  const typing = useTypingStore((s) => s.typing[space])
  const lastSentRef = useRef<{ space: Space; at: number }>({ space, at: 0 })

  // Expire stale indicators (the store keeps them for TYPING_TIMEOUT_MS after the last event).
  useEffect(() => {
    const t = setInterval(() => useTypingStore.getState().prune(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const sendTyping = useCallback(() => {
    if (!user || !profile) return
    const now = Date.now()
    const last = lastSentRef.current
    if (last.space === space && now - last.at < TYPING_THROTTLE) return
    lastSentRef.current = { space, at: now }
    broadcastTyping(space, { user_id: user.id, nickname: profile.nickname })
  }, [user, profile, space])

  /** Message sent, command run or box cleared: tell the others now, and let the next keystroke announce again at once. */
  const stopTyping = useCallback(() => {
    const last = lastSentRef.current
    lastSentRef.current = { space, at: 0 }
    if (!user || last.at === 0) return
    broadcastTypingStop(last.space, user.id)
  }, [user, space])

  return {
    typingUsers: typing.filter((t) => t.user_id !== user?.id),
    sendTyping,
    stopTyping,
  }
}
