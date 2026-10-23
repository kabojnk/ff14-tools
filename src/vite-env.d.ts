/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_BUNNY_CDN_URL: string
  readonly VITE_NATIVE_UPDATE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** The app version from package.json, injected by Vite's `define`. */
declare const __APP_VERSION__: string
/** The build date (YYYY-MM-DD, UTC), injected by Vite's `define`. */
declare const __BUILD_DATE__: string
/** The live-update version of this web bundle (`<package version>-<UTC stamp>`), injected by Vite's `define`. */
declare const __BUNDLE_VERSION__: string
