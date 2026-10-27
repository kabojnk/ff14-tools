import { useEffect } from 'react'
import { flushSync } from 'react-dom'
import { appIsActive, onAppStateChange } from '@/lib/appLifecycle'
import { clearExternalUi, externalUiExpected, watchFilePickers } from '@/lib/externalUi'
import { isNativeApp } from '@/lib/platform'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { usePresenceStore } from '@/stores/presenceStore'
import { useUiStore } from '@/stores/uiStore'

/** While visible, profiles.last_seen_at is refreshed this often. */
export const LAST_SEEN_HEARTBEAT_MS = 60_000

/**
 * Puts the disguise up the moment the person leaves, committed to the DOM before the handler returns: iOS takes
 * the app-switcher snapshot and freezes the page right after, without waiting for React's next render.
 */
export function disguiseNow(): void {
  flushSync(() => useUiStore.getState().disguiseOnLeave())
}

export function usePresence(): void {
  const { user, profile } = useAuthStore()
  // After a fresh login the user arrives before the profile; start once both are here.
  const ready = !!user && !!profile

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
      disguiseNow()
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
        disguiseNow()
        const live = usePresenceStore.getState()
        void live.setDevicePresence('offline')
        void live.touchLastSeen()
      } else {
        hidePrivacyScreen()
        restorePresence()
      }
    }

    const heartbeat = window.setInterval(() => {
      if (document.visibilityState === 'visible') void usePresenceStore.getState().touchLastSeen()
    }, LAST_SEEN_HEARTBEAT_MS)

    // In the iOS app the app's own background/foreground signal replaces the web events, which WKWebView
    // doesn't deliver reliably. The native privacy screen covers the switcher card; #privacy-screen
    // stays as a second layer.
    if (isNativeApp()) {
      // A page loaded while the app is in the background (the updater applies bundles there) starts
      // as if it had just gone there: covered, offline and disguised. The old page's pause handler may
      // lose the race with the reload, so this can't rely on it having saved the disguise.
      void appIsActive().then((active) => {
        if (active) return
        showPrivacyScreen()
        void usePresenceStore.getState().setDevicePresence('offline')
        disguiseNow()
      })
      const stop = onAppStateChange((active) => {
        if (active) {
          hidePrivacyScreen()
          restorePresence()
          // iOS may have closed the socket while suspended; reconnecting rejoins every channel, and
          // the conversation's rejoin catches up on missed messages (useConversationRealtime).
          if (!supabase.realtime.isConnected()) supabase.realtime.connect()
        } else {
          showPrivacyScreen()
          const live = usePresenceStore.getState()
          void live.setDevicePresence('offline')
          void live.touchLastSeen()
          disguiseNow()
        }
      })
      return () => {
        window.clearInterval(heartbeat)
        usePresenceStore.getState().cleanupPresence()
        stop()
      }
    }

    // Phones: the window loses focus the moment the person leaves (home screen, app switcher, Control
    // Center), before iOS says the page is hidden, and a quick trip away may never say so. The disguise
    // goes up then, unless the app itself opened what took the focus (a photo picker, the mic prompt).
    const isPhone = window.matchMedia?.('(pointer: coarse)').matches === true
    const handleBlur = () => {
      if (!isPhone || externalUiExpected()) return
      showPrivacyScreen()
      disguiseNow()
    }
    const handleFocus = () => {
      clearExternalUi()
      if (document.visibilityState !== 'hidden') hidePrivacyScreen()
    }
    const stopWatchingPickers = watchFilePickers()

    window.addEventListener('pagehide', handlePageHide)
    window.addEventListener('pageshow', handlePageShow)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('blur', handleBlur)
    window.addEventListener('focus', handleFocus)

    return () => {
      window.clearInterval(heartbeat)
      usePresenceStore.getState().cleanupPresence()
      window.removeEventListener('pagehide', handlePageHide)
      window.removeEventListener('pageshow', handlePageShow)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('blur', handleBlur)
      window.removeEventListener('focus', handleFocus)
      stopWatchingPickers()
    }
  // Only re-run if the logged-in user changes or their profile first loads — not on every profile update
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, ready])
}
