import { useEffect } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { usePresenceStore } from '@/stores/presenceStore'
import { useUiStore } from '@/stores/uiStore'

/** While visible, profiles.last_seen_at is refreshed this often. */
export const LAST_SEEN_HEARTBEAT_MS = 60_000

export function usePresence(): void {
  const { user, profile } = useAuthStore()

  useEffect(() => {
    if (!user || !profile) return

    const ps = usePresenceStore.getState()
    const visible = document.visibilityState !== 'hidden'
    ps.initPresence(user.id, profile.presence_override ?? null, visible ? 'online' : 'offline')
    void ps.touchLastSeen()

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
      void usePresenceStore.getState().touchLastSeen()
    }
    // Only this device goes online/offline; the user's other devices are unaffected.
    const restorePresence = () => {
      void usePresenceStore.getState().setDevicePresence('online')
    }

    const handlePageShow = () => {
      hidePrivacyScreen()
      // pageshow is the reliable restore event on iOS PWA — visibilitychange(visible)
      // does not always fire when returning from the background.
      restorePresence()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        showPrivacyScreen()
        const live = usePresenceStore.getState()
        void live.setDevicePresence('offline')
        void live.touchLastSeen()
        useUiStore.getState().setEepMode(true)
      } else {
        hidePrivacyScreen()
        restorePresence()
      }
    }

    const heartbeat = window.setInterval(() => {
      if (document.visibilityState === 'visible') void usePresenceStore.getState().touchLastSeen()
    }, LAST_SEEN_HEARTBEAT_MS)

    window.addEventListener('pagehide', handlePageHide)
    window.addEventListener('pageshow', handlePageShow)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.clearInterval(heartbeat)
      usePresenceStore.getState().cleanupPresence()
      window.removeEventListener('pagehide', handlePageHide)
      window.removeEventListener('pageshow', handlePageShow)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  // Only re-run if the logged-in user changes — not on every profile update
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])
}
