import { createClient, processLock } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Check your .env file.')
}

/** How long an auth request (sign-in, token refresh) may take before it's abandoned. */
export const AUTH_FETCH_TIMEOUT_MS = 10_000

/**
 * Auth requests get a time limit. Back from the background, iOS can leave the token refresh's request
 * hanging forever, and every query (the PIN check too) waits behind it for the session. Timed out, the
 * refresh fails as a network error: the session is kept and the next try refreshes again.
 */
export const fetchWithAuthTimeout: typeof fetch = (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if (!url.includes('/auth/v1/') || init?.signal) return fetch(input, init)
  return fetch(input, { ...init, signal: AbortSignal.timeout(AUTH_FETCH_TIMEOUT_MS) })
}

/**
 * The session lock is this page's own (processLock), not the browser-wide Web Lock supabase-js uses by default.
 * iOS reloads a page it discarded in the background, and the old copy can stay frozen while holding that
 * browser-wide lock: the new page then waited for it on every request (the PIN check never answered) until
 * the app was killed. Tabs no longer wait for each other: two refreshing at once is fine, since Supabase
 * accepts a just-used refresh token for a few seconds (its reuse interval).
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { lock: processLock },
  global: { fetch: fetchWithAuthTimeout },
})

// e2e only (the test server runs `vite --mode test`): lets a spec check that realtime channels don't
// grow with the number of messages. Never in a production build.
if (import.meta.env.MODE === 'test' && typeof window !== 'undefined') {
  ;(window as Window & { __realtimeChannelCount?: () => number }).__realtimeChannelCount = () => supabase.getChannels().length
}
