import { isNativeApp } from '@/lib/platform'
import { installExternalLinks } from '@/native/externalLinks'
import { followStatusBar } from '@/native/statusBar'
import { startUpdates } from '@/native/updates'

/**
 * Resolves once React has put something in #root. No timer of its own: if the app never renders, the
 * updater's appReadyTimeout rolls the bundle back. (A JS timer could fire late after iOS suspends a page
 * started in the background, and withdraw a good bundle.)
 */
function whenRendered(): Promise<void> {
  const root = document.getElementById('root')
  if (!root || root.childElementCount) return Promise.resolve()
  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      if (!root.childElementCount) return
      observer.disconnect()
      resolve()
    })
    observer.observe(root, { childList: true })
  })
}

/**
 * Native-only start-up, loaded once by main.tsx in `--mode native` builds after React's first render:
 * - the privacy screen: on "resign active" iOS gets the Splash image (the FF14 picker) for the
 *   switcher card, before it takes the snapshot
 * - web links open in Safari; the status bar text follows the screen
 * - notifyAppReady() once the app has rendered, so the updater keeps this bundle (one that never
 *   renders is rolled back after appReadyTimeout)
 * - then live updates (startUpdates() once per call, so call this once)
 * Returns a function that undoes the listeners (for tests).
 */
export async function startNative(): Promise<() => void> {
  if (!isNativeApp()) return () => {}
  // The updater's appReadyTimeout (10 s) runs from the bundle's load, so nothing on the way to
  // notifyAppReady() may wait on another plugin: a slow or hung one must not roll back a good bundle.
  const rendered = whenRendered()
  const [{ PrivacyScreen }, { CapacitorUpdater }, { StatusBar, Style }] = await Promise.all([
    import('@capacitor/privacy-screen'),
    import('@capgo/capacitor-updater'),
    import('@capacitor/status-bar'),
  ])

  void PrivacyScreen.enable({ ios: { blurEffect: 'none' } }).catch((e: unknown) =>
    console.warn('[native] privacy screen unavailable', e),
  )
  const stopLinks = installExternalLinks(document, (url) =>
    import('@capacitor/browser').then(({ Browser }) => Browser.open({ url })),
  )
  const stopBar = followStatusBar(document, (style) =>
    StatusBar.setStyle({ style: style === 'DARK' ? Style.Dark : Style.Light }).catch(() => {}),
  )

  void rendered.then(async () => {
    await CapacitorUpdater.notifyAppReady().catch((e: unknown) => console.warn('[native] notifyAppReady failed', e))
    startUpdates()
  })

  return () => {
    stopLinks()
    stopBar()
  }
}
