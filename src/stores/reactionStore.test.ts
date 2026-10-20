import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Reaction } from '@/types'

type Result = { data: unknown; error: { code?: string; message: string } | null }

const h = vi.hoisted(() => {
  const state = {
    selects: [] as { ids: string[] }[],
    inserts: [] as Record<string, unknown>[],
    deletes: [] as Record<string, unknown>[],
    selectResult: null as null | Promise<Result> | (() => Promise<Result>),
    insertResult: null as null | Promise<Result>,
    deleteResult: null as null | Promise<Result>,
  }
  const from = (table: string) => {
    if (table !== 'reactions') throw new Error(`unexpected table ${table}`)
    return {
      select: () => ({
        in: (_col: string, ids: string[]) => ({
          order: () => {
            state.selects.push({ ids })
            const r = state.selectResult
            return typeof r === 'function' ? r() : (r ?? Promise.resolve({ data: [], error: null }))
          },
        }),
      }),
      insert: (row: Record<string, unknown>) => {
        state.inserts.push(row)
        return { select: () => ({ single: () => state.insertResult ?? Promise.resolve({ data: { id: 'srv', created_at: 'now', ...row }, error: null }) }) }
      },
      delete: () => {
        const filter: Record<string, unknown> = {}
        const chain = {
          eq(col: string, v: unknown) {
            filter[col] = v
            if (Object.keys(filter).length === 3) {
              state.deletes.push({ ...filter })
              return state.deleteResult ?? Promise.resolve({ data: null, error: null })
            }
            return chain
          },
        }
        return chain
      },
    }
  }
  return { state, from }
})
vi.mock('@/lib/supabase', () => ({ supabase: { from: h.from } }))

import { chipsOf, isFromLoad, useReactionStore } from '@/stores/reactionStore'

const rx = (id: string, message_id: string, user_id: string, emoji: string, created_at = '2026-10-19T10:00:00Z'): Reaction => ({
  id,
  message_id,
  user_id,
  emoji,
  created_at,
})

const store = () => useReactionStore.getState()

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

beforeEach(() => {
  h.state.selects.length = 0
  h.state.inserts.length = 0
  h.state.deletes.length = 0
  h.state.selectResult = null
  h.state.insertResult = null
  h.state.deleteResult = null
  store().reset()
})

describe('reactionStore.loadFor', () => {
  it('fetches one page in one query and indexes rows by message and id', async () => {
    h.state.selectResult = Promise.resolve({
      data: [rx('r1', 'm1', 'alice', '❤️'), rx('r2', 'm2', 'bea', '😂')],
      error: null,
    })
    await store().loadFor(['m1', 'm2', 'm3'])
    expect(h.state.selects).toEqual([{ ids: ['m1', 'm2', 'm3'] }])
    expect(store().byMessage.m1.map((r) => r.id)).toEqual(['r1'])
    expect(store().byMessage.m2.map((r) => r.id)).toEqual(['r2'])
    expect(store().byMessage.m3).toEqual([])
    expect(store().idToMessage).toEqual({ r1: 'm1', r2: 'm2' })
  })

  it('does nothing for an empty page', async () => {
    await store().loadFor([])
    expect(h.state.selects).toEqual([])
  })

  it('replaces what it had for those messages (a reaction removed while away goes)', async () => {
    store().apply('INSERT', rx('r1', 'm1', 'alice', '❤️'))
    h.state.selectResult = Promise.resolve({ data: [], error: null })
    await store().loadFor(['m1'])
    expect(store().byMessage.m1).toEqual([])
    expect(store().idToMessage.r1).toBeUndefined()
  })

  it('keeps realtime changes that land while the query is in flight', async () => {
    const d = deferred<Result>()
    h.state.selectResult = d.promise
    store().apply('INSERT', rx('old', 'm1', 'bea', '👍'))
    const loading = store().loadFor(['m1'])
    store().apply('INSERT', rx('late', 'm1', 'bea', '🔥'))
    store().apply('DELETE', { id: 'old' })
    // The snapshot was taken before both events.
    d.resolve({ data: [rx('old', 'm1', 'bea', '👍')], error: null })
    await loading
    expect(store().byMessage.m1.map((r) => r.id)).toEqual(['late'])
  })

  it('leaves the state alone on an error', async () => {
    store().apply('INSERT', rx('r1', 'm1', 'alice', '❤️'))
    h.state.selectResult = Promise.resolve({ data: null, error: { message: 'boom' } })
    await store().loadFor(['m1'])
    expect(store().byMessage.m1.map((r) => r.id)).toEqual(['r1'])
  })

  it('never throws (the message list must still load)', async () => {
    h.state.selectResult = () => Promise.reject(new Error('offline'))
    await expect(store().loadFor(['m1'])).resolves.toBeUndefined()
  })
})

describe('reactionStore.apply', () => {
  it('INSERT appends a new row once (a repeated event is a no-op)', () => {
    store().apply('INSERT', rx('r1', 'm1', 'alice', '❤️'))
    store().apply('INSERT', rx('r1', 'm1', 'alice', '❤️'))
    expect(store().byMessage.m1).toHaveLength(1)
    expect(store().idToMessage.r1).toBe('m1')
  })

  it('INSERT replaces my optimistic row with the same (message, user, emoji) and its server id', async () => {
    const d = deferred<Result>()
    h.state.insertResult = d.promise
    const toggling = store().toggle('m1', '❤️', 'alice')
    expect(store().byMessage.m1).toHaveLength(1)
    store().apply('INSERT', rx('srv1', 'm1', 'alice', '❤️'))
    expect(store().byMessage.m1.map((r) => r.id)).toEqual(['srv1'])
    d.resolve({ data: rx('srv1', 'm1', 'alice', '❤️'), error: null })
    await expect(toggling).resolves.toBe(true)
    expect(store().byMessage.m1.map((r) => r.id)).toEqual(['srv1'])
    expect(store().idToMessage).toEqual({ srv1: 'm1' })
  })

  it('DELETE removes by id alone, through the index', () => {
    store().apply('INSERT', rx('r1', 'm1', 'alice', '❤️'))
    store().apply('INSERT', rx('r2', 'm1', 'bea', '❤️'))
    store().apply('DELETE', { id: 'r1' })
    expect(store().byMessage.m1.map((r) => r.id)).toEqual(['r2'])
    expect(store().idToMessage.r1).toBeUndefined()
  })

  it('DELETE of an unknown id is a no-op (events reach every subscriber)', () => {
    store().apply('INSERT', rx('r1', 'm1', 'alice', '❤️'))
    const before = store().byMessage
    store().apply('DELETE', { id: 'nope' })
    expect(store().byMessage).toBe(before)
  })

  it('ignores an INSERT without the row fields', () => {
    store().apply('INSERT', { id: 'r9' })
    expect(store().idToMessage).toEqual({})
  })
})

describe('reactionStore.toggle', () => {
  it('adds my reaction at once, then swaps in the server row', async () => {
    const p = store().toggle('m1', '🔥', 'alice')
    expect(chipsOf(store().byMessage.m1, 'alice')).toEqual([{ emoji: '🔥', count: 1, mine: true, userIds: ['alice'] }])
    await expect(p).resolves.toBe(true)
    expect(h.state.inserts).toEqual([{ message_id: 'm1', user_id: 'alice', emoji: '🔥' }])
    expect(store().byMessage.m1.map((r) => r.id)).toEqual(['srv'])
    expect(store().idToMessage.srv).toBe('m1')
  })

  it('rolls an add back and returns false on error', async () => {
    h.state.insertResult = Promise.resolve({ data: null, error: { message: 'nope' } })
    await expect(store().toggle('m1', '🔥', 'alice')).resolves.toBe(false)
    expect(store().byMessage.m1).toEqual([])
  })

  it('treats a duplicate (23505) as already there and refetches the message', async () => {
    h.state.insertResult = Promise.resolve({ data: null, error: { code: '23505', message: 'dup' } })
    h.state.selectResult = Promise.resolve({ data: [rx('real', 'm1', 'alice', '🔥')], error: null })
    await expect(store().toggle('m1', '🔥', 'alice')).resolves.toBe(true)
    expect(store().byMessage.m1.map((r) => r.id)).toEqual(['real'])
  })

  it('removes my reaction at once by (message, user, emoji)', async () => {
    store().apply('INSERT', rx('r1', 'm1', 'alice', '❤️'))
    store().apply('INSERT', rx('r2', 'm1', 'bea', '❤️'))
    const p = store().toggle('m1', '❤️', 'alice')
    expect(store().byMessage.m1.map((r) => r.id)).toEqual(['r2'])
    await expect(p).resolves.toBe(true)
    expect(h.state.deletes).toEqual([{ message_id: 'm1', user_id: 'alice', emoji: '❤️' }])
    // My own DELETE echo then finds nothing to do.
    store().apply('DELETE', { id: 'r1' })
    expect(store().byMessage.m1.map((r) => r.id)).toEqual(['r2'])
  })

  it('puts a removal back where it was and returns false on error', async () => {
    store().apply('INSERT', rx('r1', 'm1', 'alice', '❤️'))
    store().apply('INSERT', rx('r2', 'm1', 'bea', '😂'))
    h.state.deleteResult = Promise.resolve({ data: null, error: { message: 'nope' } })
    await expect(store().toggle('m1', '❤️', 'alice')).resolves.toBe(false)
    expect(store().byMessage.m1.map((r) => r.id)).toEqual(['r1', 'r2'])
    expect(store().idToMessage.r1).toBe('m1')
  })
})

describe('chips', () => {
  it('groups by emoji in order of first use, with counts, mine and who', () => {
    store().apply('INSERT', rx('r1', 'm1', 'bea', '😂'))
    store().apply('INSERT', rx('r2', 'm1', 'alice', '❤️'))
    store().apply('INSERT', rx('r3', 'm1', 'alice', '😂'))
    expect(store().chips('m1', 'alice')).toEqual([
      { emoji: '😂', count: 2, mine: true, userIds: ['bea', 'alice'] },
      { emoji: '❤️', count: 1, mine: true, userIds: ['alice'] },
    ])
    expect(store().chips('m1', 'bea')[1].mine).toBe(false)
    expect(store().chips('unknown', 'alice')).toEqual([])
  })
})

describe('isFromLoad', () => {
  it('marks rows from a page load, not live ones', async () => {
    h.state.selectResult = Promise.resolve({ data: [rx('r1', 'm1', 'alice', '❤️')], error: null })
    await store().loadFor(['m1'])
    store().apply('INSERT', rx('r2', 'm1', 'bea', '😂'))
    const [loaded, live] = store().byMessage.m1
    expect(isFromLoad(loaded)).toBe(true)
    expect(isFromLoad(live)).toBe(false)
  })
})
