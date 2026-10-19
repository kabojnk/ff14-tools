import { describe, expect, it, vi } from 'vitest'
import type { RealtimeChannel } from '@supabase/supabase-js'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))

import { createConversationRealtime, type ConversationHandlers, type RealtimeClientLike } from '@/lib/conversationRealtime'

type Listener = { type: string; filter: Record<string, unknown>; cb: (p: unknown) => void }

class FakeChannel {
  listeners: Listener[] = []
  subscribeCalls = 0
  statusCb: ((s: string) => void) | null = null
  sent: unknown[] = []
  constructor(
    readonly topic: string,
    readonly opts: unknown,
  ) {}
  on(type: string, filter: Record<string, unknown>, cb: (p: unknown) => void) {
    this.listeners.push({ type, filter, cb })
    return this
  }
  subscribe(cb: (s: string) => void) {
    this.subscribeCalls++
    this.statusCb = cb
    return this
  }
  send(msg: unknown) {
    this.sent.push(msg)
    return Promise.resolve('ok')
  }
  emitBroadcast(event: string, payload: unknown) {
    for (const l of this.listeners) if (l.type === 'broadcast' && l.filter.event === event) l.cb({ payload })
  }
  emitPg(table: string, event: string, payload: unknown) {
    for (const l of this.listeners)
      if (l.type === 'postgres_changes' && l.filter.table === table && (l.filter.event === event || l.filter.event === '*'))
        l.cb(payload)
  }
}

function fakeClient() {
  const registry: FakeChannel[] = []
  const created: FakeChannel[] = []
  const removed: FakeChannel[] = []
  const forgotten: FakeChannel[] = []
  const client = {
    channel(topic: string, opts: unknown) {
      const full = `realtime:${topic}`
      const existing = registry.find((c) => c.topic === full)
      if (existing) return existing as unknown as RealtimeChannel
      const ch = new FakeChannel(full, opts)
      registry.push(ch)
      created.push(ch)
      return ch as unknown as RealtimeChannel
    },
    getChannels: () => [...registry] as unknown as RealtimeChannel[],
    removeChannel(ch: RealtimeChannel) {
      removed.push(ch as unknown as FakeChannel)
      // Like realtime-js while connected: the channel stays registered until the server acks the leave.
      return Promise.resolve('ok')
    },
    forgetChannel(ch: RealtimeChannel) {
      forgotten.push(ch as unknown as FakeChannel)
      registry.splice(registry.indexOf(ch as unknown as FakeChannel), 1)
    },
  }
  return { client: client as RealtimeClientLike & typeof client, registry, created, removed, forgotten }
}

function handlers(): ConversationHandlers & { [K in keyof ConversationHandlers]: ReturnType<typeof vi.fn> } {
  return { onMessage: vi.fn(), onTyping: vi.fn(), onTypingStop: vi.fn(), onLake: vi.fn(), onReadPosition: vi.fn(), onStatus: vi.fn() }
}

describe('conversationRealtime', () => {
  it('mount, unmount, mount (StrictMode) leaves one fresh, subscribed channel', () => {
    const { client, created, removed } = fakeClient()
    const rt = createConversationRealtime(client)
    const h1 = handlers()
    const leave1 = rt.joinConversation('c1', h1)
    leave1()
    const h2 = handlers()
    rt.joinConversation('c1', h2)

    expect(created).toHaveLength(2)
    expect(created[1]).not.toBe(created[0])
    expect(created[1].subscribeCalls).toBe(1)
    expect(created[1].opts).toMatchObject({ config: { private: true, broadcast: { self: false } } })
    // The left channel is removed exactly once, and dropped from the registry even before the server acks.
    expect(removed).toEqual([created[0]])

    // Late callbacks from the first channel are ignored.
    created[0].statusCb?.('SUBSCRIBED')
    created[0].emitBroadcast('lake', {})
    expect(h1.onStatus).not.toHaveBeenCalledWith('SUBSCRIBED', expect.anything())
    created[1].statusCb?.('SUBSCRIBED')
    expect(h2.onStatus).toHaveBeenCalledWith('SUBSCRIBED', false)
  })

  it('removes a lingering channel registered for the topic before creating a fresh one', () => {
    const { client, created, removed, forgotten } = fakeClient()
    const stale = client.channel('conv:c1', {}) as unknown as FakeChannel
    const rt = createConversationRealtime(client)
    rt.joinConversation('c1', handlers())
    expect(removed).toEqual([stale])
    expect(forgotten).toEqual([stale])
    expect(created).toHaveLength(2)
    expect(created[1]).not.toBe(stale)
    expect(created[1].subscribeCalls).toBe(1)
  })

  it('joining the same conversation twice subscribes once and returns the same leave', () => {
    const { client, created } = fakeClient()
    const rt = createConversationRealtime(client)
    const a = rt.joinConversation('c1', handlers())
    const b = rt.joinConversation('c1', handlers())
    expect(a).toBe(b)
    expect(created).toHaveLength(1)
    expect(created[0].subscribeCalls).toBe(1)
  })

  it('reports a re-subscribe as rejoined', () => {
    const { client, created } = fakeClient()
    const rt = createConversationRealtime(client)
    const h = handlers()
    rt.joinConversation('c1', h)
    expect(h.onStatus).toHaveBeenCalledWith('JOINING', false)
    created[0].statusCb?.('SUBSCRIBED')
    created[0].statusCb?.('CHANNEL_ERROR')
    created[0].statusCb?.('SUBSCRIBED')
    expect(h.onStatus.mock.calls).toEqual([
      ['JOINING', false],
      ['SUBSCRIBED', false],
      ['CHANNEL_ERROR', false],
      ['SUBSCRIBED', true],
    ])
  })

  it('routes broadcasts and database changes to the handlers', () => {
    vi.useFakeTimers()
    const { client, created } = fakeClient()
    const rt = createConversationRealtime(client)
    const h = handlers()
    rt.joinConversation('c1', h)
    const ch = created[0]
    const msg = { id: 'm1', space: 'main', deleted: false }

    ch.emitBroadcast('message', { kind: 'new', message: msg })
    ch.emitBroadcast('typing', { space: 'schist', user_id: 'u2', nickname: 'Bea' })
    ch.emitPg('messages', 'INSERT', { new: msg })
    ch.emitPg('messages', 'UPDATE', { new: { ...msg, deleted: true } })
    ch.emitPg('read_positions', 'UPDATE', { new: { space: 'main' } })
    ch.emitPg('sessions', 'UPDATE', {})
    ch.emitBroadcast('lake', {})

    expect(h.onMessage.mock.calls).toEqual([
      [msg, 'new'],
      [msg, 'new'],
      [{ ...msg, deleted: true }, 'delete'],
    ])
    expect(h.onTyping).toHaveBeenCalledWith('schist', { user_id: 'u2', nickname: 'Bea' })
    expect(h.onReadPosition).toHaveBeenCalledWith({ space: 'main' })
    expect(h.onLake).not.toHaveBeenCalled()
    vi.advanceTimersByTime(250)
    expect(h.onLake).toHaveBeenCalledTimes(1) // debounced
    vi.useRealTimers()
  })

  it('binds the database safety nets to this conversation', () => {
    const { client, created } = fakeClient()
    createConversationRealtime(client).joinConversation('c1', handlers())
    const pg = created[0].listeners.filter((l) => l.type === 'postgres_changes')
    expect(pg.map((l) => l.filter.table).sort()).toEqual(['messages', 'messages', 'read_positions', 'read_positions', 'sessions'])
    for (const l of pg) expect(l.filter.filter).toBe('conversation_id=eq.c1')
  })

  it('sends on the joined channel and stops after leaving', () => {
    const { client, created } = fakeClient()
    const rt = createConversationRealtime(client)
    const leave = rt.joinConversation('c1', handlers())
    rt.sendTyping('main', { user_id: 'u1', nickname: 'Alice' })
    rt.sendLake()
    rt.sendMessageEvent('delete', { id: 'm1', space: 'main' })
    expect(created[0].sent).toEqual([
      { type: 'broadcast', event: 'typing', payload: { space: 'main', user_id: 'u1', nickname: 'Alice' } },
      { type: 'broadcast', event: 'lake', payload: {} },
      { type: 'broadcast', event: 'message', payload: { kind: 'delete', message: { id: 'm1', space: 'main' } } },
    ])
    leave()
    rt.sendLake()
    expect(created[0].sent).toHaveLength(3)
  })

  it('relays typing stops both ways', () => {
    const { client, created } = fakeClient()
    const rt = createConversationRealtime(client)
    const h = handlers()
    rt.joinConversation('c1', h)
    created[0].emitBroadcast('typing_stop', { space: 'schist', user_id: 'u2' })
    expect(h.onTypingStop).toHaveBeenCalledWith('schist', 'u2')

    rt.sendTypingStop('main', 'u1')
    expect(created[0].sent).toEqual([
      { type: 'broadcast', event: 'typing_stop', payload: { space: 'main', user_id: 'u1' } },
    ])
  })

  it('leaveConversation (sign-out) removes the channel', () => {
    const { client, created, removed } = fakeClient()
    const rt = createConversationRealtime(client)
    rt.joinConversation('c1', handlers())
    rt.leaveConversation()
    expect(removed).toEqual([created[0]])
  })
})
