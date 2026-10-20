import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Check your .env file.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// e2e only (the test server runs `vite --mode test`): lets a spec check that realtime channels don't
// grow with the number of messages. Never in a production build.
if (import.meta.env.MODE === 'test' && typeof window !== 'undefined') {
  ;(window as Window & { __realtimeChannelCount?: () => number }).__realtimeChannelCount = () => supabase.getChannels().length
}
