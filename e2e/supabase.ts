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
 * clears Bea's custom status and message, and gives Alice back "Found Out". Rows already in the seed
 * state are not written (see restore).
 */
export async function restoreStatuses() {
  const svc = serviceClient()
  check('created statuses', (await svc.from('status_definitions').delete().is('legacy_key', null)).error)
  const { data: foundOut, error } = await svc.from('status_definitions').select('id').eq('legacy_key', 'found_out').single()
  check('found_out status', error)
  const foundOutId = (foundOut as { id: string }).id
  check(
    'alice status',
    (await svc
      .from('profiles')
      .update({ status: 'offline', status_id: foundOutId, custom_status_text: null, presence_override: null })
      .eq('id', IDS.users.alice)
      .or(`status.neq.offline,status_id.is.null,status_id.neq.${foundOutId},custom_status_text.not.is.null,presence_override.not.is.null`)).error,
  )
  check(
    'bea status',
    (await svc
      .from('profiles')
      .update({ status: 'offline', status_id: null, custom_status_text: null, presence_override: null })
      .eq('id', IDS.users.bea)
      .or('status.neq.offline,status_id.not.is.null,custom_status_text.not.is.null,presence_override.not.is.null')).error,
  )
}

/**
 * Puts back the seed state that state-changing specs touch. global-setup resets the database only
 * once per run (and webkit-iphone runs after chromium-desktop), so call this in afterEach/finally.
 * - Alice's and Bea's PINs (through set_pin, as each user, only if verify_pin says they changed)
 * - the lake password
 * - sessions: the seed sessions as seeded; any session a test created (a drag) deleted, with its messages
 * - read receipts on
 * - statuses (restoreStatuses)
 *
 * It writes only what a test changed. Every row written to a published table is a postgres_changes
 * message for each matching subscription (each device holds several on profiles and sessions, and those
 * of a closed device linger until Realtime cleans them up). Local Realtime allows 100 a second per tenant
 * and past that stops delivering them for a while (MessagePerSecondRateLimitReached in its log), so a
 * blanket rewrite here made the NEXT test miss changes.
 */
export async function restore() {
  const svc = serviceClient()

  for (const key of Object.keys(USERS) as UserKey[]) {
    const client = await userClient(key)
    const { data: same, error } = await client.rpc('verify_pin', { p_pin: USERS[key].pin })
    check(`${key} PIN check`, error)
    if (!same) check(`${key} PIN`, (await client.rpc('set_pin', { p_pin: USERS[key].pin })).error)
    await client.auth.signOut({ scope: 'local' })
  }

  check(
    'lake password',
    (await svc.from('private_secrets').update({ value_hash: LAKE_PASSWORD_HASH }).eq('key', 'lake_password')).error,
  )

  // Sessions a test created (drags, change_sheets) are deleted with their messages rather than hidden:
  // left to pile up, every Fill (and every restore) rewrote dozens of them at once.
  const seedIds = Object.keys(SEED_SESSION_VISIBILITY)
  check(
    'test sessions',
    (await svc.from('sessions').delete().eq('conversation_id', IDS.conversation).not('id', 'in', `(${seedIds.join(',')})`)).error,
  )
  const { data: sessions, error } = await svc.from('sessions').select('id, visible').in('id', seedIds)
  check('sessions', error)
  for (const s of (sessions ?? []) as { id: string; visible: boolean }[]) {
    const visible = SEED_SESSION_VISIBILITY[s.id]
    if (s.visible === visible) continue
    check('session visibility', (await svc.from('sessions').update({ visible }).eq('id', s.id)).error)
  }

  check(
    'read receipts',
    (await svc
      .from('profiles')
      .update({ read_receipts: true })
      .in('id', [IDS.users.alice, IDS.users.bea])
      .eq('read_receipts', false)).error,
  )

  await restoreStatuses()
}
