import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StatusDefinition } from '@/types'

type Op = [string, unknown[]]
type Result = { data: unknown; error: unknown }
type Handler = (payload: { eventType: string; new: unknown; old: unknown }) => void

// A chainable fake of the supabase query builder plus a fake realtime channel.
const h = vi.hoisted(() => {
  const tables: Record<string, (ops: Op[]) => Result> = {}
  const queries: { table: string; ops: Op[] }[] = []
  const channels: { name: string; filter: unknown; handler: Handler | null; subscribed: boolean }[] = []
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
    const entry = { name, filter: null as unknown, handler: null as Handler | null, subscribed: false }
    channels.push(entry)
    const ch = {
      on(_type: string, filter: unknown, handler: Handler) {
        entry.filter = filter
        entry.handler = handler
        return ch
      },
      subscribe() {
        entry.subscribed = true
        return ch
      },
    }
    return ch
  }
  return { tables, queries, channels, removeChannel, from, channel }
})

vi.mock('@/lib/supabase', () => ({
  supabase: { from: h.from, channel: h.channel, removeChannel: h.removeChannel },
}))

import { useStatusStore, validateStatus } from '@/stores/statusStore'

function def(id: string, position: number, created_at = '2026-10-19T00:00:00Z', over: Partial<StatusDefinition> = {}): StatusDefinition {
  return {
    id,
    label: id,
    color: '#112233',
    position,
    legacy_key: null,
    created_by: null,
    created_at,
    updated_at: created_at,
    ...over,
  }
}

const initial = useStatusStore.getState()
const hasOp = (ops: Op[], name: string) => ops.some(([n]) => n === name)
const opArgs = (ops: Op[], name: string) => ops.find(([n]) => n === name)?.[1]

beforeEach(() => {
  useStatusStore.getState().unsubscribe()
  useStatusStore.setState(initial, true)
  for (const k of Object.keys(h.tables)) delete h.tables[k]
  h.queries.length = 0
  h.channels.length = 0
  h.removeChannel.mockReset()
})

describe('validateStatus', () => {
  it('accepts a trimmed 1–40 character label and a 6-digit hex colour', () => {
    expect(validateStatus({ label: '  Raiding ', color: '#FF66aa' })).toBeNull()
    expect(validateStatus({ label: 'x'.repeat(40), color: '#000000' })).toBeNull()
  })

  it('rejects blank or overlong labels', () => {
    expect(validateStatus({ label: '   ', color: '#000000' })).toMatch(/label/i)
    expect(validateStatus({ label: 'x'.repeat(41), color: '#000000' })).toMatch(/label/i)
  })

  it('rejects colours that are not #rrggbb', () => {
    for (const color of ['#fff', 'ff66aa', '#ff66ag', '#ff66aa0', 'red']) {
      expect(validateStatus({ label: 'ok', color })).toMatch(/colou?r/i)
    }
  })
})

describe('statusStore.load', () => {
  it('loads definitions ordered by position, then created_at', async () => {
    h.tables.status_definitions = () => ({ data: [def('a', 0), def('b', 1)], error: null })
    await useStatusStore.getState().load()
    expect(useStatusStore.getState().definitions.map((d) => d.id)).toEqual(['a', 'b'])
    expect(useStatusStore.getState().loaded).toBe(true)
    const q = h.queries.find((x) => x.table === 'status_definitions')!
    const orders = q.ops.filter(([n]) => n === 'order').map(([, a]) => a[0])
    expect(orders).toEqual(['position', 'created_at'])
  })
})

describe('statusStore.subscribe', () => {
  beforeEach(async () => {
    h.tables.status_definitions = () => ({ data: [def('a', 0), def('b', 2)], error: null })
    await useStatusStore.getState().load()
  })

  it('listens to every change on status_definitions, once', () => {
    useStatusStore.getState().subscribe()
    useStatusStore.getState().subscribe()
    expect(h.channels).toHaveLength(1)
    expect(h.channels[0].filter).toEqual({ event: '*', schema: 'public', table: 'status_definitions' })
    expect(h.channels[0].subscribed).toBe(true)
  })

  it('keeps the list in step with inserts, updates and deletes, in order', () => {
    useStatusStore.getState().subscribe()
    const fire = h.channels[0].handler!
    fire({ eventType: 'INSERT', new: def('c', 1), old: {} })
    expect(useStatusStore.getState().definitions.map((d) => d.id)).toEqual(['a', 'c', 'b'])

    fire({ eventType: 'UPDATE', new: def('a', 0, undefined, { color: '#22cc88' }), old: { id: 'a' } })
    expect(useStatusStore.getState().definitions.find((d) => d.id === 'a')!.color).toBe('#22cc88')

    fire({ eventType: 'DELETE', new: {}, old: { id: 'c' } })
    expect(useStatusStore.getState().definitions.map((d) => d.id)).toEqual(['a', 'b'])
  })

  it('a repeated insert does not duplicate the row', () => {
    useStatusStore.getState().subscribe()
    h.channels[0].handler!({ eventType: 'INSERT', new: def('a', 0), old: {} })
    expect(useStatusStore.getState().definitions).toHaveLength(2)
  })

  it('the cleanup removes the channel and lets a later subscribe join again', () => {
    const stop = useStatusStore.getState().subscribe()
    stop()
    expect(h.removeChannel).toHaveBeenCalledTimes(1)
    useStatusStore.getState().subscribe()
    expect(h.channels).toHaveLength(2)
  })
})

describe('statusStore CRUD', () => {
  beforeEach(async () => {
    h.tables.status_definitions = (ops) => {
      if (hasOp(ops, 'insert')) {
        const row = (opArgs(ops, 'insert')![0]) as Partial<StatusDefinition>
        return { data: def('new', row.position ?? 0, '2026-10-19T01:00:00Z', row), error: null }
      }
      if (hasOp(ops, 'update') || hasOp(ops, 'delete')) return { data: null, error: null }
      return { data: [def('a', 0), def('b', 3)], error: null }
    }
    await useStatusStore.getState().load()
    h.queries.length = 0
  })

  it('create trims the label, places it last and adds it to the list', async () => {
    const res = await useStatusStore.getState().create({ label: '  Raiding ', color: '#ff66aa' })
    expect(res.error).toBeNull()
    expect(res.definition?.id).toBe('new')
    const q = h.queries.find((x) => x.table === 'status_definitions')!
    expect(opArgs(q.ops, 'insert')).toEqual([{ label: 'Raiding', color: '#ff66aa', position: 4 }])
    expect(useStatusStore.getState().definitions.map((d) => d.id)).toEqual(['a', 'b', 'new'])
  })

  it('create rejects invalid input without calling the server', async () => {
    const res = await useStatusStore.getState().create({ label: '', color: '#ff66aa' })
    expect(res.error).toMatch(/label/i)
    const res2 = await useStatusStore.getState().create({ label: 'ok', color: 'pink' })
    expect(res2.error).toMatch(/colou?r/i)
    expect(h.queries).toHaveLength(0)
  })

  it('update validates the merged result, writes the patch and applies it locally', async () => {
    const res = await useStatusStore.getState().update('a', { color: '#22cc88' })
    expect(res.error).toBeNull()
    const q = h.queries.find((x) => x.table === 'status_definitions')!
    expect(opArgs(q.ops, 'update')).toEqual([{ color: '#22cc88' }])
    expect(opArgs(q.ops, 'eq')).toEqual(['id', 'a'])
    expect(useStatusStore.getState().definitions.find((d) => d.id === 'a')!.color).toBe('#22cc88')
  })

  it('update rejects invalid input without calling the server', async () => {
    const res = await useStatusStore.getState().update('a', { label: ' ' })
    expect(res.error).toMatch(/label/i)
    expect(h.queries).toHaveLength(0)
  })

  it('update trims the label', async () => {
    await useStatusStore.getState().update('a', { label: ' Busy ' })
    const q = h.queries.find((x) => x.table === 'status_definitions')!
    expect(opArgs(q.ops, 'update')).toEqual([{ label: 'Busy' }])
  })

  it('remove deletes the row and drops it from the list', async () => {
    const res = await useStatusStore.getState().remove('a')
    expect(res.error).toBeNull()
    const q = h.queries.find((x) => x.table === 'status_definitions')!
    expect(hasOp(q.ops, 'delete')).toBe(true)
    expect(opArgs(q.ops, 'eq')).toEqual(['id', 'a'])
    expect(useStatusStore.getState().definitions.map((d) => d.id)).toEqual(['b'])
  })

  it('a server error is returned and the list is left alone', async () => {
    h.tables.status_definitions = () => ({ data: null, error: { message: 'boom' } })
    const res = await useStatusStore.getState().remove('a')
    expect(res.error).toBe('boom')
    expect(useStatusStore.getState().definitions.map((d) => d.id)).toEqual(['a', 'b'])
  })
})
