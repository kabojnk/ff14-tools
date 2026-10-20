import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { IDS, USERS, type UserKey } from './users'

/** The local stack's API URL and keys, written by global-setup on every run (gitignored). */
export const ENV_FILE = 'e2e/.auth/env.json'
/** The seeded messages as they were right after the last reset, written by global-setup (gitignored). */
export const SEED_MESSAGES_FILE = 'e2e/.auth/seed-messages.json'
/** Every seeded message has an ID in this range (supabase/seed.sql: cccccccc-…). */
const SEED_MESSAGE_IDS = ['cccccccc-0000-0000-0000-000000000000', 'cccccccc-ffff-ffff-ffff-ffffffffffff'] as const
const seedMessages = () =>
  serviceClient().from('messages').select('*').gte('id', SEED_MESSAGE_IDS[0]).lte('id', SEED_MESSAGE_IDS[1]).order('id')

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

/**
 * Marks everything in a space read for a user, as if they had scrolled to the bottom just now. The seed
 * has no read positions, so on a fresh database the whole history is unread and the list opens at the
 * new-messages divider near the top (and, rightly, marks nothing read until it is scrolled down).
 */
export async function readEverything(key: UserKey, space: 'main' | 'schist') {
  const { error } = await serviceClient()
    .from('read_positions')
    .upsert({ conversation_id: IDS.conversation, user_id: IDS.users[key], space, last_read_at: new Date().toISOString() })
  if (error) throw new Error(`read everything (${key}, ${space}): ${error.message}`)
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

type Row = Record<string, unknown>

/**
 * Records the seeded messages for restoreSeedMessages. global-setup calls it right after a reset; with
 * E2E_SKIP_RESET=1 it keeps the record from the last reset (or, if there is none, takes one now).
 */
export async function snapshotSeedMessages({ ifMissing = false } = {}) {
  if (ifMissing && existsSync(SEED_MESSAGES_FILE)) return
  const { data, error } = await seedMessages()
  if (error) throw new Error(`snapshot seed messages: ${error.message}`)
  writeFileSync(SEED_MESSAGES_FILE, JSON.stringify(data, null, 2))
}

/**
 * Puts back any seeded message a test (or a test that failed half-way) changed: deleted, edited,
 * moved to another session, marked as a spoiler, or gone. Untouched rows are not written.
 */
export async function restoreSeedMessages() {
  if (!existsSync(SEED_MESSAGES_FILE)) return
  const seed = JSON.parse(readFileSync(SEED_MESSAGES_FILE, 'utf8')) as Row[]
  if (seed.length === 0) return
  const svc = serviceClient()
  const { data, error } = await seedMessages()
  check('seed messages', error)
  const now = new Map(((data ?? []) as Row[]).map((r) => [r.id as string, r]))
  const same = (a: Row, b: Row) => Object.keys(a).every((k) => JSON.stringify(a[k]) === JSON.stringify(b[k]))
  const missing = seed.filter((r) => !now.has(r.id as string))
  if (missing.length) check('missing seed messages', (await svc.from('messages').insert(missing)).error)
  for (const row of seed) {
    const current = now.get(row.id as string)
    if (!current || same(row, current)) continue
    check(`seed message ${row.id as string}`, (await svc.from('messages').update(row).eq('id', row.id as string)).error)
  }
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
 * - the seeded messages (restoreSeedMessages)
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
  // Each step runs even if an earlier one failed, sessions and messages first: a test that failed
  // half-way must not leave the seed history hidden or changed for every test after it.
  const steps: [string, () => Promise<void>][] = [
    ['sessions', restoreSessions],
    ['seed messages', restoreSeedMessages],
    ['lake password', restoreLakePassword],
    ['read receipts', restoreReadReceipts],
    ['statuses', restoreStatuses],
    ['PINs', restorePins],
  ]
  const failures: string[] = []
  for (const [name, step] of steps) {
    try {
      await step()
    } catch (e) {
      failures.push(`${name}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  if (failures.length) throw new Error(`restore failed:\n${failures.join('\n')}`)
}

async function restorePins() {
  for (const key of Object.keys(USERS) as UserKey[]) {
    const client = await userClient(key)
    const { data: same, error } = await client.rpc('verify_pin', { p_pin: USERS[key].pin })
    check(`${key} PIN check`, error)
    if (!same) check(`${key} PIN`, (await client.rpc('set_pin', { p_pin: USERS[key].pin })).error)
    await client.auth.signOut({ scope: 'local' })
  }
}

async function restoreLakePassword() {
  check(
    'lake password',
    (await serviceClient().from('private_secrets').update({ value_hash: LAKE_PASSWORD_HASH }).eq('key', 'lake_password')).error,
  )
}

async function restoreSessions() {
  const svc = serviceClient()
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
}

async function restoreReadReceipts() {
  check(
    'read receipts',
    (await serviceClient()
      .from('profiles')
      .update({ read_receipts: true })
      .in('id', [IDS.users.alice, IDS.users.bea])
      .eq('read_receipts', false)).error,
  )
}
