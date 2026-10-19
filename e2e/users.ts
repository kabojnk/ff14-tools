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

export const EEP_PASSPHRASE = 'test-passphrase'
export const EEP_HEADING = 'FF14 Random Content Running Agenda Picker'
