/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_TENOR_API_KEY: string
  readonly VITE_BUNNY_CDN_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
