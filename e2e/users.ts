export const USERS = {
  alice: {
    key: 'alice',
    email: 'alice@test.local',
    password: 'password123',
    nickname: 'Alice',
    pin: '1234',
    storageState: 'e2e/.auth/alice.json',
  },
  bea: {
    key: 'bea',
    email: 'bea@test.local',
    password: 'password123',
    nickname: 'Bea',
    pin: '567890',
    storageState: 'e2e/.auth/bea.json',
  },
} as const

export type UserKey = keyof typeof USERS
export type SeedUser = (typeof USERS)[UserKey]

/** Fixed seed IDs (supabase/seed.sql). */
export const IDS = {
  conversation: 'd0000000-0000-4000-8000-000000000001',
  channels: {
    general: 'aaaaaaaa-0000-4000-8000-000000000001',
    schist: 'aaaaaaaa-0000-4000-8000-000000000002',
  },
  sessions: {
    current: 'bbbbbbbb-0000-4000-8000-000000000001',
    hidden: 'bbbbbbbb-0000-4000-8000-000000000002',
  },
  users: {
    alice: '11111111-1111-4111-8111-111111111111',
    bea: '22222222-2222-4222-8222-222222222222',
    cleo: '33333333-3333-4333-8333-333333333333',
  },
} as const

export const LAKE_PASSWORD = 'test-lake-password'

export const EEP_PASSPHRASE = 'test-passphrase'
export const EEP_HEADING = 'Aetherdesk'
