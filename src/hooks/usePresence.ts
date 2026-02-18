import { useEffect } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { usePresenceStore } from '@/stores/presenceStore'
import { supabase } from '@/lib/supabase'

export function usePresence() {
  const { user, profile } = useAuthStore()
  const { initPresence, cleanupPresence, onlineUsers } = usePresenceStore()

  useEffect(() => {
    if (!user || !profile) return

    // Initialize presence tracking
    initPresence(
      user.id,
      'online',
      profile.custom_status_text,
      profile.custom_status_emoji
    )

    // Update profile status in DB
    supabase
      .from('profiles')
      .update({ status: 'online' })
      .eq('id', user.id)
      .then(() => {})

    // Set to offline on unmount/close
    const handleBeforeUnload = () => {
      supabase
        .from('profiles')
        .update({ status: 'offline' })
        .eq('id', user.id)
        .then(() => {})
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    // Detect away (5 min idle)
    let idleTimeout: ReturnType<typeof setTimeout>
    const resetIdle = () => {
      clearTimeout(idleTimeout)
      // If we were away, go back online
      const current = usePresenceStore.getState().onlineUsers[user.id]
      if (current?.status === 'away') {
        supabase
          .from('profiles')
          .update({ status: 'online' })
          .eq('id', user.id)
          .then(() => {})
      }

      idleTimeout = setTimeout(() => {
        supabase
          .from('profiles')
          .update({ status: 'away' })
          .eq('id', user.id)
          .then(() => {})
      }, 5 * 60 * 1000) // 5 minutes
    }

    window.addEventListener('mousemove', resetIdle)
    window.addEventListener('keydown', resetIdle)
    resetIdle()

    return () => {
      handleBeforeUnload()
      cleanupPresence()
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('mousemove', resetIdle)
      window.removeEventListener('keydown', resetIdle)
      clearTimeout(idleTimeout)
    }
  }, [user, profile, initPresence, cleanupPresence])

  return { onlineUsers }
}
