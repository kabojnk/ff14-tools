import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => {
  const calls: { table: string; select: string; ids: string[] }[] = []
  let rows: Record<string, unknown>[] = []
  return {
    calls,
    setRows: (r: Record<string, unknown>[]) => {
      rows = r
    },
    from(table: string) {
      return {
        select(select: string) {
          return {
            in(_col: string, ids: string[]) {
              calls.push({ table, select, ids })
              return Promise.resolve({ data: rows, error: null })
            },
          }
        },
      }
    },
  }
})
vi.mock('@/lib/supabase', () => ({ supabase: { from: h.from } }))

import { PROFILE_COLUMNS, useProfileStore } from '@/stores/profileStore'

const bea = {
  id: 'bea',
  nickname: 'Bea',
  avatar_url: null,
  banner_url: null,
  profile_message: null,
  status: 'online',
  custom_status_text: 'back at 9',
  status_id: 's1',
  read_receipts: true,
  lock_pin_length: 4,
  presence_override: null,
  last_seen_at: '2026-10-19T09:14:00Z',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const keys = (o: unknown) => Object.keys(o as Record<string, unknown>)

beforeEach(() => {
  h.calls.length = 0
  h.setRows([])
  useProfileStore.getState().reset()
})

describe('profileStore', () => {
  it('loads the members by id, never selecting the PIN', async () => {
    h.setRows([{ ...bea }])
    await useProfileStore.getState().load(['alice', 'bea'])
    expect(h.calls).toEqual([{ table: 'profiles', select: PROFILE_COLUMNS, ids: ['alice', 'bea'] }])
    expect(PROFILE_COLUMNS.split(',').map((c) => c.trim())).not.toContain('lock_pin')
    expect(PROFILE_COLUMNS).not.toContain('*')
    expect(useProfileStore.getState().profiles.bea?.nickname).toBe('Bea')
  })

  it('does nothing for an empty member list', async () => {
    await useProfileStore.getState().load([])
    expect(h.calls).toEqual([])
  })

  it('drops lock_pin from a realtime row and never stores it', () => {
    useProfileStore.getState().apply({ ...bea, lock_pin: '1234', nickname: 'Bea 2' })
    const stored = useProfileStore.getState().profiles.bea
    expect(stored?.nickname).toBe('Bea 2')
    expect(keys(stored)).not.toContain('lock_pin')
  })

  it('merges a partial update into what it has', () => {
    useProfileStore.getState().apply({ ...bea })
    useProfileStore.getState().apply({ id: 'bea', presence_override: 'away', lock_pin: null })
    const stored = useProfileStore.getState().profiles.bea
    expect(stored?.presence_override).toBe('away')
    expect(stored?.custom_status_text).toBe('back at 9')
    expect(keys(stored)).not.toContain('lock_pin')
  })

  it('a load strips lock_pin even if the server sends it', async () => {
    h.setRows([{ ...bea, lock_pin: '1234' }])
    await useProfileStore.getState().load(['bea'])
    expect(keys(useProfileStore.getState().profiles.bea)).not.toContain('lock_pin')
  })

  it('ignores rows without an id', () => {
    useProfileStore.getState().apply({ nickname: 'nobody' })
    expect(useProfileStore.getState().profiles).toEqual({})
  })
})
