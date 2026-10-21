import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  // A placeholder until Apple Developer enrolment; the runbook says how to change it.
  appId: 'tools.xiv.app',
  appName: 'XIV',
  webDir: 'dist-native',
  ios: {
    // The web content runs under the status bar and home indicator, as in the PWA (viewport-fit=cover).
    contentInset: 'never',
  },
  plugins: {
    CapacitorUpdater: {
      // Manual mode: the app checks its own server (src/native/updates.ts). Never Capgo's servers.
      autoUpdate: false,
      statsUrl: '',
      // A bundle that hasn't called notifyAppReady() after 10 s is rolled back.
      appReadyTimeout: 10000,
      // Failed bundles are kept (marked 'error') so the app knows not to download them again.
      autoDeleteFailed: false,
      autoDeletePrevious: true,
      // A new TestFlight build starts from the bundle inside it.
      resetWhenUpdate: true,
    },
  },
}

export default config
