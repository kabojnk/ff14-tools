import { useEffect } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { usePresenceStore } from '@/stores/presenceStore'
import { supabase } from '@/lib/supabase'

export function usePresence() {
  const { user, profile } = useAuthStore()
  const { initPresence, cleanupPresence, updatePresence, onlineUsers } = usePresenceStore()

  // One-time setup when user logs in — only re-runs if user changes
  useEffect(() => {
    if (!user || !profile) return

    // Use the profile's stored status (respects user's manual choice), default to online
    const initialStatus = profile.status === 'offline' ? 'offline' : profile.status ?? 'online'

    initPresence(
      user.id,
      initialStatus,
      profile.custom_status_text,
      profile.custom_status_emoji
    )

    // Only set to online in DB on first connect if not intentionally hidden
    if (profile.status !== 'offline') {
      supabase
        .from('profiles')
        .update({ status: 'online' })
        .eq('id', user.id)
        .then(() => {})
    }

    // Set to offline on tab close
    const handleBeforeUnload = () => {
      supabase
        .from('profiles')
        .update({ status: 'offline' })
        .eq('id', user.id)
        .then(() => {})
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    // Detect idle (5 min) — skipped entirely if user has manually chosen a status
    let idleTimeout: ReturnType<typeof setTimeout>
    const resetIdle = () => {
      clearTimeout(idleTimeout)

      const presenceState = usePresenceStore.getState()

      // If user deliberately picked any status, don't override with auto-away/auto-online
      if (presenceState.manualStatus !== null) return

      const current = presenceState.onlineUsers[user.id]

      // Restore to online if we were auto-away (and no manual override)
      if (current?.status === 'away') {
        supabase
          .from('profiles')
          .update({ status: 'online' })
          .eq('id', user.id)
          .then(() => {})
        updatePresence('online', current.custom_status_text, current.custom_status_emoji)
      }

      idleTimeout = setTimeout(() => {
        // Re-check in case user manually set something during the timeout
        if (usePresenceStore.getState().manualStatus !== null) return
        const latest = usePresenceStore.getState().onlineUsers[user.id]
        supabase
          .from('profiles')
          .update({ status: 'away' })
          .eq('id', user.id)
          .then(() => {})
        updatePresence('away', latest?.custom_status_text ?? null, latest?.custom_status_emoji ?? null)
      }, 5 * 60 * 1000)
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
  // Only depend on user.id — not profile, so profile updates (fetchProfile) don't restart presence
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  return { onlineUsers }
}
