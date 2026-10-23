import { isNativeApp } from '@/lib/platform'

type Listener = (active: boolean) => void

const listeners = new Set<Listener>()
let listening = false
let current: boolean | null = null

function emit(active: boolean) {
  if (current === active) return
  current = active
  for (const l of [...listeners]) l(active)
}

/**
 * The iOS app going to the background (false) and coming back to the foreground (true).
 * - Background is Capacitor's 'pause' (didEnterBackground), not "inactive": Control Center, permission
 *   prompts, Face ID and calls make the app inactive without leaving it, and must not drop the user into
 *   the disguise mid-flow. The native privacy screen covers the switcher card from "inactive" on.
 * - Foreground is 'resume', or becoming active (which also settles a cold start, where no resume fires).
 *   Each change is reported once.
 * WKWebView doesn't deliver visibilitychange / pagehide reliably, so inside the app this replaces them.
 * Outside the app it never fires (and website builds drop the native code). Returns an unsubscribe.
 */
export function onAppStateChange(listener: Listener): () => void {
  if (import.meta.env.MODE === 'native' && isNativeApp()) {
    listeners.add(listener)
    if (!listening) {
      listening = true
      void import('@capacitor/app').then(({ App }) =>
        Promise.all([
          App.addListener('pause', () => emit(false)),
          App.addListener('resume', () => emit(true)),
          App.addListener('appStateChange', ({ isActive }) => {
            if (isActive) emit(true)
          }),
        ]),
      )
    }
    return () => {
      listeners.delete(listener)
    }
  }
  return () => {}
}

/**
 * Whether the app is in the foreground now. A page can start in the background: the updater reloads
 * the web view there to apply a new bundle. Always true outside the app.
 */
export async function appIsActive(): Promise<boolean> {
  if (import.meta.env.MODE === 'native' && isNativeApp()) {
    const { App } = await import('@capacitor/app')
    return (await App.getState()).isActive
  }
  return true
}
