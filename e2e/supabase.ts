import { readFileSync } from 'node:fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { IDS, USERS, type UserKey } from './users'

/** The local stack's API URL and keys, written by global-setup on every run (gitignored). */
export const ENV_FILE = 'e2e/.auth/env.json'

function env(): { apiUrl: string; anonKey: string; serviceRoleKey: string } {
  return JSON.parse(readFileSync(ENV_FILE, 'utf8'))
}

const noSession = { auth: { persistSession: false, autoRefreshToken: false } }

/** A client with the LOCAL service-role key: bypasses RLS. For test setup and restore only. */
export function serviceClient(): SupabaseClient {
  const { apiUrl, serviceRoleKey } = env()
  return createClient(apiUrl, serviceRoleKey, noSession)
}

/** A client signed in as a seeded user, e.g. to act like a cached old app. */
export async function userClient(key: UserKey): Promise<SupabaseClient> {
  const { apiUrl, anonKey } = env()
  const client = createClient(apiUrl, anonKey, noSession)
  const { error } = await client.auth.signInWithPassword({ email: USERS[key].email, password: USERS[key].password })
  if (error) throw new Error(`sign in ${key}: ${error.message}`)
  return client
}

/** bcrypt hash of LAKE_PASSWORD ('test-lake-password'); pgcrypto's crypt() verifies any bf hash. */
const LAKE_PASSWORD_HASH = '$2a$06$XA9SA7Zf/i882ZaICzf7V.KBpRyjrgh2atYOndw5EbZYpMg5cfEPm'

const SEED_SESSION_VISIBILITY: Record<string, boolean> = {
  [IDS.sessions.current]: true,
  [IDS.sessions.hidden]: false,
}

function check(what: string, error: { message: string } | null) {
  if (error) throw new Error(`restore ${what}: ${error.message}`)
}

/**
 * Puts back the seeded statuses: deletes every status a test created (seeded ones have a legacy_key),
 * clears Bea's custom status and message, and gives Alice back "Found Out".
 */
export async function restoreStatuses() {
  const svc = serviceClient()
  check('created statuses', (await svc.from('status_definitions').delete().is('legacy_key', null)).error)
  const { data: foundOut, error } = await svc.from('status_definitions').select('id').eq('legacy_key', 'found_out').single()
  check('found_out status', error)
  check(
    'alice status',
    (await svc
      .from('profiles')
      .update({ status: 'offline', status_id: (foundOut as { id: string }).id, custom_status_text: null })
      .eq('id', IDS.users.alice)).error,
  )
  check(
    'bea status',
    (await svc.from('profiles').update({ status: 'offline', status_id: null, custom_status_text: null }).eq('id', IDS.users.bea)).error,
  )
}

/**
 * Puts back the seed state that state-changing specs touch. global-setup resets the database only
 * once per run (and webkit-iphone runs after chromium-desktop), so call this in afterEach/finally.
 * - Alice's and Bea's PINs (through set_pin, as each user)
 * - the lake password
 * - session visibility: the seed sessions as seeded; any session a test created (a drag) hidden
 * - read receipts on
 * - statuses (restoreStatuses)
 */
export async function restore() {
  const svc = serviceClient()

  for (const key of Object.keys(USERS) as UserKey[]) {
    const client = await userClient(key)
    check(`${key} PIN`, (await client.rpc('set_pin', { p_pin: USERS[key].pin })).error)
    await client.auth.signOut()
  }

  check(
    'lake password',
    (await svc.from('private_secrets').update({ value_hash: LAKE_PASSWORD_HASH }).eq('key', 'lake_password')).error,
  )

  const { data: sessions, error } = await svc.from('sessions').select('id').eq('conversation_id', IDS.conversation)
  check('sessions', error)
  for (const s of (sessions ?? []) as { id: string }[]) {
    const visible = SEED_SESSION_VISIBILITY[s.id] ?? false
    check('session visibility', (await svc.from('sessions').update({ visible }).eq('id', s.id)).error)
  }

  check(
    'read receipts',
    (await svc.from('profiles').update({ read_receipts: true }).in('id', [IDS.users.alice, IDS.users.bea])).error,
  )

  await restoreStatuses()
}
