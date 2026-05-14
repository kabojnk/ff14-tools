import { useEffect, useRef } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { usePresenceStore } from '@/stores/presenceStore'
import { useUiStore } from '@/stores/uiStore'
import type { UserStatus } from '@/types'

export function usePresence() {
  const { user, profile } = useAuthStore()
  const { initPresence, cleanupPresence, updatePresence, onlineUsers } = usePresenceStore()

  // Tracks the status to restore when the tab becomes visible again
  const savedStatusRef = useRef<UserStatus>('online')

  useEffect(() => {
    if (!user || !profile) return

    // Restore exactly the status they had — never auto-reset to 'online'
    const initialStatus: UserStatus = profile.status ?? 'online'
    savedStatusRef.current = initialStatus

    initPresence(
      user.id,
      initialStatus,
      profile.custom_status_text,
      profile.custom_status_emoji
    )

    // When the tab hides (switch tab, minimize, alt-tab) → appear offline.
    // When it comes back → restore their chosen status.
    // We only touch the realtime presence track here, not the DB, so their
    // status preference survives refreshes and tab switches.
    const handleVisibilityChange = () => {
      const userId = user.id
      if (document.visibilityState === 'hidden') {
        // Snapshot the current live status before going offline
        const live = usePresenceStore.getState().onlineUsers[userId]?.status
        if (live && live !== 'offline') savedStatusRef.current = live
        updatePresence('offline', null, null)

        // Always switch to fake screen so app switcher preview is private.
        // If a PIN is configured, also require it on return.
        const { pinCode, lockApp, setEepMode } = useUiStore.getState()
        if (pinCode) {
          lockApp()
        } else {
          setEepMode(true)
        }
      } else {
        // Restore presence — eep/lock state stays until user authenticates
        const p = useAuthStore.getState().profile
        updatePresence(
          savedStatusRef.current,
          p?.custom_status_text ?? null,
          p?.custom_status_emoji ?? null
        )
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      cleanupPresence()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  // Only re-run if the logged-in user changes — not on every profile update
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  return { onlineUsers }
}
