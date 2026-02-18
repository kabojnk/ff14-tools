import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import type { RealtimeChannel } from '@supabase/supabase-js'

interface TypingUser {
  user_id: string
  nickname: string
  timestamp: number
}

const TYPING_TIMEOUT = 5000 // 5 seconds until typing indicator disappears
const TYPING_THROTTLE = 3000 // Send typing event at most every 3 seconds

export function useTyping(channelId: string) {
  const { user, profile } = useAuthStore()
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([])
  const channelRef = useRef<RealtimeChannel | null>(null)
  const lastTypingSentRef = useRef(0)
  const cleanupIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const channel = supabase
      .channel(`typing:${channelId}`)
      .on('broadcast', { event: 'typing_start' }, ({ payload }) => {
        if (payload.user_id === user?.id) return // Ignore own typing
        setTypingUsers((prev) => {
          const filtered = prev.filter((t) => t.user_id !== payload.user_id)
          return [...filtered, { ...payload, timestamp: Date.now() }]
        })
      })
      .subscribe()

    channelRef.current = channel

    // Cleanup expired typing indicators
    cleanupIntervalRef.current = setInterval(() => {
      const now = Date.now()
      setTypingUsers((prev) => prev.filter((t) => now - t.timestamp < TYPING_TIMEOUT))
    }, 1000)

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
      if (cleanupIntervalRef.current) {
        clearInterval(cleanupIntervalRef.current)
      }
    }
  }, [channelId, user?.id])

  const sendTyping = useCallback(() => {
    if (!user || !profile || !channelRef.current) return
    const now = Date.now()
    if (now - lastTypingSentRef.current < TYPING_THROTTLE) return
    lastTypingSentRef.current = now

    channelRef.current.send({
      type: 'broadcast',
      event: 'typing_start',
      payload: { user_id: user.id, nickname: profile.nickname },
    })
  }, [user, profile])

  return {
    typingUsers: typingUsers.filter((t) => t.user_id !== user?.id),
    sendTyping,
  }
}
