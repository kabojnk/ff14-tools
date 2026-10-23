import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CustomEmoji } from '@/types'

type Op = [string, unknown[]]
type Result = { data: unknown; error: unknown }
type Handler = (payload: { eventType: string; new: unknown; old: unknown }) => void

// A chainable fake of the supabase query builder (a result per table and operation) plus a fake channel.
const h = vi.hoisted(() => {
  const tables: Record<string, (ops: Op[]) => Result | Promise<Result>> = {}
  const queries: { table: string; ops: Op[] }[] = []
  const channels: {
    name: string
    handlers: { filter: { event: string }; handler: Handler }[]
    status: ((s: string) => void) | null
  }[] = []
  const removeChannel = vi.fn()
  function from(table: string) {
    const ops: Op[] = []
    queries.push({ table, ops })
    const builder: object = new Proxy(
      {},
      {
        get(_t, prop: string) {
          if (prop === 'then') {
            const result = tables[table]?.(ops) ?? { data: null, error: null }
            return (res: (r: Result) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(result).then(res, rej)
          }
          return (...args: unknown[]) => {
            ops.push([prop, args])
            return builder
          }
        },
      },
    )
    return builder
  }
  function channel(name: string) {
    const entry = { name, handlers: [] as { filter: { event: string }; handler: Handler }[], status: null as ((s: string) => void) | null }
    channels.push(entry)
    const ch = {
      on(_type: string, filter: { event: string }, handler: Handler) {
        entry.handlers.push({ filter, handler })
        return ch
      },
      subscribe(cb?: (s: string) => void) {
        entry.status = cb ?? null
        return ch
      },
    }
    return ch
  }
  const uploadFile = vi.fn()
  return { tables, queries, channels, removeChannel, from, channel, uploadFile }
})

vi.mock('@/lib/supabase', () => ({
  supabase: { from: h.from, channel: h.channel, removeChannel: h.removeChannel },
}))
vi.mock('@/lib/bunny', () => ({ uploadFile: h.uploadFile }))

import { useEmojiStore } from '@/stores/emojiStore'

function row(id: string, name: string, created_at = '2026-10-19T00:00:00Z'): CustomEmoji {
  return { id, name, image_url: `https://cdn/${name}.png`, uploaded_by: 'u1', created_at }
}

const has = (ops: Op[], name: string) => ops.some(([n]) => n === name)
const queriesOf = (op: string) => h.queries.filter((q) => q.table === 'custom_emoji' && has(q.ops, op))
const selects = () => h.queries.filter((q) => q.table === 'custom_emoji' && q.ops[0]?.[0] === 'select')

/** Fires a realtime event on the custom-emoji channel. */
function emit(eventType: 'INSERT' | 'DELETE', payload: { new?: unknown; old?: unknown }) {
  const ch = [...h.channels].reverse().find((c) => c.name.startsWith('custom-emoji'))
  if (!ch) throw new Error('no custom-emoji channel')
  for (const { filter, handler } of ch.handlers) {
    if (filter.event === eventType || filter.event === '*') handler({ eventType, new: payload.new ?? {}, old: payload.old ?? {} })
  }
}

/** Every select returns these rows; insert and delete answer per test. */
let serverRows: CustomEmoji[] = []
let insertResult: Result = { data: null, error: null }
let deleteResult: Result | Promise<Result> = { data: null, error: null }

beforeEach(() => {
  useEmojiStore.getState().reset()
  h.queries.length = 0
  h.channels.length = 0
  h.removeChannel.mockReset()
  h.uploadFile.mockReset()
  serverRows = []
  insertResult = { data: null, error: null }
  deleteResult = { data: null, error: null }
  h.tables.custom_emoji = (ops) => {
    if (has(ops, 'insert')) return insertResult
    if (has(ops, 'delete')) return deleteResult
    return { data: serverRows, error: null }
  }
})

afterEach(() => {
  vi.useRealTimers()
})

const file = () => new File(['x'], 'emoji.png', { type: 'image/png' })

describe('emojiStore.load', () => {
  it('loads once, newest first, and looks emoji up by name', async () => {
    serverRows = [row('a', 'blob', '2026-10-01T00:00:00Z'), row('b', 'cat', '2026-10-02T00:00:00Z')]
    const before = useEmojiStore.getState().lookup
    await Promise.all([useEmojiStore.getState().load(), useEmojiStore.getState().load()])
    await useEmojiStore.getState().load()
    expect(selects()).toHaveLength(1)
    expect(selects()[0].ops[0][1][0]).toBe('id, name, image_url, uploaded_by, created_at')
    const s = useEmojiStore.getState()
    expect(s.loaded).toBe(true)
    expect(s.rows.map((r) => r.name)).toEqual(['cat', 'blob'])
    expect(s.lookup).not.toBe(before)
    expect(s.lookup('blob')).toBe('https://cdn/blob.png')
    expect(s.lookup('nope')).toBeUndefined()
    expect(s.byName).toEqual({ blob: 'https://cdn/blob.png', cat: 'https://cdn/cat.png' })
  })

  it('stays unloaded on an error, so a later call tries again', async () => {
    h.tables.custom_emoji = () => ({ data: null, error: { message: 'boom' } })
    await useEmojiStore.getState().load()
    expect(useEmojiStore.getState().loaded).toBe(false)
    h.tables.custom_emoji = () => ({ data: [], error: null })
    await useEmojiStore.getState().load()
    expect(useEmojiStore.getState().loaded).toBe(true)
  })

  it('joins the live feed the first time it loads, and only once', async () => {
    await useEmojiStore.getState().load()
    useEmojiStore.getState().subscribe()
    await useEmojiStore.getState().load()
    expect(h.channels.map((c) => c.name)).toEqual([expect.stringMatching(/^custom-emoji:/)])
    expect(h.channels[0].handlers.map((x) => x.filter.event).sort()).toEqual(['DELETE', 'INSERT'])
  })

  it('loads again when the feed reconnects, but not on the first join', async () => {
    serverRows = [row('a', 'blob')]
    await useEmojiStore.getState().load()
    const ch = h.channels[0]
    ch.status?.('SUBSCRIBED')
    expect(selects()).toHaveLength(1)
    serverRows = [row('a', 'blob'), row('b', 'cat', '2026-10-20T00:00:00Z')]
    ch.status?.('CHANNEL_ERROR')
    ch.status?.('SUBSCRIBED')
    await vi.waitFor(() => expect(useEmojiStore.getState().byName.cat).toBe('https://cdn/cat.png'))
    expect(selects()).toHaveLength(2)
  })

  it('keeps the lookup identity when a reload finds the same set', async () => {
    serverRows = [row('a', 'blob')]
    await useEmojiStore.getState().load()
    const before = useEmojiStore.getState().lookup
    h.channels[0].status?.('SUBSCRIBED')
    h.channels[0].status?.('SUBSCRIBED')
    await vi.waitFor(() => expect(selects()).toHaveLength(2))
    await Promise.resolve()
    expect(useEmojiStore.getState().lookup).toBe(before)
  })
})

describe('emojiStore realtime', () => {
  beforeEach(async () => {
    serverRows = [row('a', 'blob')]
    await useEmojiStore.getState().load()
  })

  it('adds an inserted emoji and removes a deleted one, changing the lookup identity each time', () => {
    const l0 = useEmojiStore.getState().lookup
    emit('INSERT', { new: row('b', 'cat', '2026-10-20T00:00:00Z') })
    const l1 = useEmojiStore.getState().lookup
    expect(l1).not.toBe(l0)
    expect(useEmojiStore.getState().byName.cat).toBe('https://cdn/cat.png')
    expect(useEmojiStore.getState().rows.map((r) => r.id)).toEqual(['b', 'a'])
    emit('DELETE', { old: { id: 'a' } })
    expect(useEmojiStore.getState().lookup).not.toBe(l1)
    expect(useEmojiStore.getState().byName).toEqual({ cat: 'https://cdn/cat.png' })
  })

  it('ignores a duplicate insert (same id)', () => {
    const l0 = useEmojiStore.getState().lookup
    emit('INSERT', { new: row('a', 'blob') })
    expect(useEmojiStore.getState().rows).toHaveLength(1)
    expect(useEmojiStore.getState().lookup).toBe(l0)
  })

  it('ignores a delete for an emoji it does not have', () => {
    const l0 = useEmojiStore.getState().lookup
    emit('DELETE', { old: { id: 'zzz' } })
    expect(useEmojiStore.getState().lookup).toBe(l0)
  })

  it('ignores a late insert for an emoji deleted here', async () => {
    await useEmojiStore.getState().remove('a')
    emit('INSERT', { new: row('a', 'blob') })
    expect(useEmojiStore.getState().byName).toEqual({})
  })
})

describe('emojiStore.add', () => {
  beforeEach(async () => {
    serverRows = [row('a', 'blob')]
    await useEmojiStore.getState().load()
  })

  it('rejects a taken name before uploading', async () => {
    const res = await useEmojiStore.getState().add('blob', file())
    expect(res.error).toBe(':blob: is already taken.')
    expect(h.uploadFile).not.toHaveBeenCalled()
  })

  it('rejects a badly formed name before uploading', async () => {
    const res = await useEmojiStore.getState().add('Bad Name', file())
    expect(res.error).toBe('Use lowercase letters, numbers and _ only.')
    expect(h.uploadFile).not.toHaveBeenCalled()
  })

  it('uploads, inserts and adds the row without waiting for realtime', async () => {
    h.uploadFile.mockResolvedValue({ url: 'https://cdn/new.png', filename: 'emoji.png', size: 1, type: 'image/png' })
    insertResult = { data: { ...row('n', 'newone', '2026-10-20T00:00:00Z'), image_url: 'https://cdn/new.png' }, error: null }
    const res = await useEmojiStore.getState().add('newone', file())
    expect(res.error).toBeNull()
    expect(h.uploadFile).toHaveBeenCalledWith(expect.any(File), 'emoji')
    const insert = queriesOf('insert')[0]
    expect(insert.ops.find(([n]) => n === 'insert')?.[1][0]).toMatchObject({ name: 'newone', image_url: 'https://cdn/new.png' })
    expect(useEmojiStore.getState().byName.newone).toBe('https://cdn/new.png')
    expect(useEmojiStore.getState().rows[0].id).toBe('n')
    // The realtime echo of our own insert is a duplicate.
    emit('INSERT', { new: { ...row('n', 'newone', '2026-10-20T00:00:00Z'), image_url: 'https://cdn/new.png' } })
    expect(useEmojiStore.getState().rows).toHaveLength(2)
  })

  it('maps a 23505 from the insert to the taken message', async () => {
    h.uploadFile.mockResolvedValue({ url: 'https://cdn/x.png', filename: 'emoji.png', size: 1, type: 'image/png' })
    insertResult = { data: null, error: { code: '23505', message: 'duplicate key' } }
    const res = await useEmojiStore.getState().add('racy', file())
    expect(res.error).toBe(':racy: is already taken.')
    expect(useEmojiStore.getState().byName.racy).toBeUndefined()
  })

  it('maps a 23514 from the insert to the name rule', async () => {
    h.uploadFile.mockResolvedValue({ url: 'https://cdn/x.png', filename: 'emoji.png', size: 1, type: 'image/png' })
    insertResult = { data: null, error: { code: '23514', message: 'check' } }
    const res = await useEmojiStore.getState().add('fine', file())
    expect(res.error).toBe('Use lowercase letters, numbers and _ only.')
  })

  it('gives the generic message for other insert errors and for a failed upload', async () => {
    h.uploadFile.mockResolvedValue({ url: 'https://cdn/x.png', filename: 'emoji.png', size: 1, type: 'image/png' })
    insertResult = { data: null, error: { code: '42501', message: 'rls' } }
    expect((await useEmojiStore.getState().add('fine', file())).error).toBe('Couldn’t add the emoji. Try again.')
    h.uploadFile.mockRejectedValue(new Error('Upload failed'))
    expect((await useEmojiStore.getState().add('fine', file())).error).toBe('Couldn’t add the emoji. Try again.')
  })
})

describe('emojiStore.remove', () => {
  beforeEach(async () => {
    serverRows = [row('a', 'blob'), row('b', 'cat', '2026-10-20T00:00:00Z')]
    await useEmojiStore.getState().load()
  })

  it('removes optimistically and deletes by id', async () => {
    let answer!: (r: Result) => void
    deleteResult = new Promise<Result>((r) => (answer = r))
    const pending = useEmojiStore.getState().remove('a')
    expect(useEmojiStore.getState().byName.blob).toBeUndefined()
    answer({ data: null, error: null })
    expect((await pending).error).toBeNull()
    const del = queriesOf('delete')[0]
    expect(del.ops.find(([n]) => n === 'eq')?.[1]).toEqual(['id', 'a'])
    expect(useEmojiStore.getState().rows.map((r) => r.id)).toEqual(['b'])
  })

  it('puts the row back when the server refuses', async () => {
    deleteResult = { data: null, error: { message: 'nope' } }
    const res = await useEmojiStore.getState().remove('a')
    expect(res.error).toBe('Couldn’t delete the emoji. Try again.')
    expect(useEmojiStore.getState().rows.map((r) => r.id)).toEqual(['b', 'a'])
    // Not deleted after all, so a realtime insert for it is not suppressed either.
    emit('DELETE', { old: { id: 'a' } })
    emit('INSERT', { new: row('a', 'blob') })
    expect(useEmojiStore.getState().byName.blob).toBe('https://cdn/blob.png')
  })

  it('forgets a locally deleted id after a while', async () => {
    vi.useFakeTimers()
    await useEmojiStore.getState().remove('a')
    vi.advanceTimersByTime(5 * 60_000)
    emit('INSERT', { new: row('a', 'blob') })
    expect(useEmojiStore.getState().byName.blob).toBe('https://cdn/blob.png')
  })

  it('a reload does not bring back a row being deleted', async () => {
    let answer!: (r: Result) => void
    deleteResult = new Promise<Result>((r) => (answer = r))
    const pending = useEmojiStore.getState().remove('a')
    h.channels[0].status?.('SUBSCRIBED')
    h.channels[0].status?.('SUBSCRIBED')
    await vi.waitFor(() => expect(selects()).toHaveLength(2))
    await Promise.resolve()
    expect(useEmojiStore.getState().byName.blob).toBeUndefined()
    answer({ data: null, error: null })
    await pending
  })
})

describe('emojiStore.reset', () => {
  it('removes the channel and forgets everything; the next load joins again', async () => {
    serverRows = [row('a', 'blob')]
    await useEmojiStore.getState().load()
    useEmojiStore.getState().reset()
    expect(h.removeChannel).toHaveBeenCalledTimes(1)
    const s = useEmojiStore.getState()
    expect(s.loaded).toBe(false)
    expect(s.rows).toEqual([])
    expect(s.lookup('blob')).toBeUndefined()
    await useEmojiStore.getState().load()
    const topics = h.channels.filter((c) => c.name.startsWith('custom-emoji')).map((c) => c.name)
    // A fresh topic each time: realtime-js hands back a channel that's still leaving under the same name.
    expect(new Set(topics).size).toBe(2)
  })

  it('drops a load that answers after the reset', async () => {
    let answer!: (r: Result) => void
    h.tables.custom_emoji = () => new Promise<Result>((r) => (answer = r))
    const pending = useEmojiStore.getState().load()
    useEmojiStore.getState().reset()
    answer({ data: [row('a', 'blob')], error: null })
    await pending
    expect(useEmojiStore.getState().loaded).toBe(false)
    expect(useEmojiStore.getState().rows).toEqual([])
  })
})
