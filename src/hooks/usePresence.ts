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

    const showPrivacyScreen = () => {
      const el = document.getElementById('privacy-screen')
      if (el) el.style.display = 'flex'
    }
    const hidePrivacyScreen = () => {
      const el = document.getElementById('privacy-screen')
      if (el) el.style.display = 'none'
    }

    // pagehide fires before the app switcher screenshot on iOS — show the
    // privacy screen via direct DOM mutation (no React re-render needed).
    const handlePageHide = () => {
      showPrivacyScreen()
      useUiStore.getState().setEepMode(true)
    }
    const restorePresence = () => {
      const ps = usePresenceStore.getState()
      if (!ps.presenceChannel || !ps.currentUserId) return
      const p = useAuthStore.getState().profile
      // Prefer an explicitly-chosen manual status over the auto-saved ref
      const statusToRestore = ps.manualStatus ?? savedStatusRef.current
      updatePresence(statusToRestore, p?.custom_status_text ?? null, p?.custom_status_emoji ?? null)
    }

    const handlePageShow = () => {
      hidePrivacyScreen()
      // pageshow is the reliable restore event on iOS PWA — visibilitychange(visible)
      // does not always fire when returning from the background.
      restorePresence()
    }

    const handleVisibilityChange = () => {
      const userId = user.id
      if (document.visibilityState === 'hidden') {
        showPrivacyScreen()
        const live = usePresenceStore.getState().onlineUsers[userId]?.status
        if (live && live !== 'offline') savedStatusRef.current = live
        updatePresence('offline', null, null)
        useUiStore.getState().setEepMode(true)
      } else {
        hidePrivacyScreen()
        restorePresence()
      }
    }

    window.addEventListener('pagehide', handlePageHide)
    window.addEventListener('pageshow', handlePageShow)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      cleanupPresence()
      window.removeEventListener('pagehide', handlePageHide)
      window.removeEventListener('pageshow', handlePageShow)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  // Only re-run if the logged-in user changes — not on every profile update
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  return { onlineUsers }
}
