import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Message, ReadPosition, Space } from '@/types'

type Op = [string, unknown[]]
type Result = { data: unknown; error: unknown }

// A chainable fake of the supabase query builder. Each table answers from `tables[name](ops)`.
const h = vi.hoisted(() => {
  const tables: Record<string, (ops: Op[]) => Result> = {}
  const queries: { table: string; ops: Op[] }[] = []
  const rpc = vi.fn()
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
  return { tables, queries, rpc, from }
})

vi.mock('@/lib/supabase', () => ({
  supabase: { from: h.from, rpc: h.rpc },
}))

import { setLakeBroadcaster, useConversationStore } from '@/stores/conversationStore'
import { useMessageStore } from '@/stores/messageStore'
import { spaceKey } from '@/lib/spaces'

const CONV = { id: 'conv-1', title: null, archived: false, created_by: null, created_at: '2026-01-01T00:00:00Z' }
const SESSION = { id: 'sess-1', conversation_id: 'conv-1', channel_id: null, visible: true, created_by: 'alice', created_at: '2026-01-01T00:00:00Z' }

function msg(id: string, space: Space, created_at: string, author_id = 'bea'): Message {
  return {
    id,
    conversation_id: 'conv-1',
    space,
    channel_id: null,
    session_id: 'sess-1',
    author_id,
    content: id,
    attachments: [],
    type: 'text',
    edited_at: null,
    deleted: false,
    created_at,
  }
}

const hasOp = (ops: Op[], name: string) => ops.some(([n]) => n === name)

function defaultTables() {
  h.tables.conversations = () => ({ data: CONV, error: null })
  h.tables.conversation_members = () => ({ data: [{ user_id: 'alice' }, { user_id: 'bea' }], error: null })
  h.tables.sessions = (ops) =>
    hasOp(ops, 'insert') ? { data: { ...SESSION, id: 'sess-new' }, error: null } : { data: SESSION, error: null }
  h.tables.read_positions = () => ({
    data: [{ conversation_id: 'conv-1', user_id: 'alice', space: 'main', last_read_at: '2026-10-19T09:00:00Z' }],
    error: null,
  })
}

function defaultRpc() {
  h.rpc.mockImplementation(async (fn: string, args: { p_space?: Space; p_limit?: number }) => {
    if (fn === 'get_messages') {
      const space = args.p_space
      const data = space === 'main' ? [msg('m2', 'main', '2026-10-19T10:00:00Z')] : [msg('s1', 'schist', '2026-10-19T08:00:00Z', 'alice')]
      return { data, error: null }
    }
    return { data: null, error: null }
  })
}

const initialState = useConversationStore.getState()
const initialMessages = useMessageStore.getState()

beforeEach(() => {
  useConversationStore.setState(initialState, true)
  useMessageStore.setState(initialMessages, true)
  for (const k of Object.keys(h.tables)) delete h.tables[k]
  h.queries.length = 0
  h.rpc.mockReset()
  defaultTables()
  defaultRpc()
  setLakeBroadcaster(() => {})
  sessionStorage.clear()
})

describe('conversationStore.load', () => {
  it('picks the conversation, its members, session, my read positions and the latest per space', async () => {
    await useConversationStore.getState().load('alice')
    const s = useConversationStore.getState()
    expect(s.conversation).toEqual(CONV)
    expect(s.memberIds).toEqual(['alice', 'bea'])
    expect(s.activeSession).toEqual(SESSION)
    expect(s.readAt).toEqual({ main: '2026-10-19T09:00:00Z', schist: null })
    expect(s.latest).toEqual({
      main: { at: '2026-10-19T10:00:00Z', authorId: 'bea' },
      schist: { at: '2026-10-19T08:00:00Z', authorId: 'alice' },
    })
    expect(s.loading).toBe(false)

    const conv = h.queries.find((q) => q.table === 'conversations')!
    expect(conv.ops).toContainEqual(['eq', ['archived', false]])
    const rp = h.queries.find((q) => q.table === 'read_positions')!
    expect(rp.ops).toContainEqual(['eq', ['user_id', 'alice']])
    expect(h.rpc).toHaveBeenCalledWith('get_messages', { p_conversation: 'conv-1', p_space: 'main', p_limit: 1 })
    expect(h.rpc).toHaveBeenCalledWith('get_messages', { p_conversation: 'conv-1', p_space: 'schist', p_limit: 1 })
  })

  it('leaves everything empty when I belong to no conversation', async () => {
    h.tables.conversations = () => ({ data: null, error: null })
    await useConversationStore.getState().load('cleo')
    const s = useConversationStore.getState()
    expect(s.conversation).toBeNull()
    expect(s.memberIds).toEqual([])
    expect(s.loading).toBe(false)
    expect(h.rpc).not.toHaveBeenCalled()
  })
})

describe('conversationStore.activeSpace', () => {
  it('starts on main and remembers the chosen space in sessionStorage', () => {
    expect(useConversationStore.getState().activeSpace).toBe('main')
    useConversationStore.getState().setActiveSpace('schist')
    expect(useConversationStore.getState().activeSpace).toBe('schist')
    expect(sessionStorage.getItem('activeSpace')).toBe('schist')
  })
})

describe('conversationStore.noteMessage', () => {
  beforeEach(async () => {
    await useConversationStore.getState().load('alice')
  })

  it('bumps latest when the message is newer', () => {
    useConversationStore.getState().noteMessage(msg('m3', 'main', '2026-10-19T11:00:00Z', 'alice'))
    expect(useConversationStore.getState().latest.main).toEqual({ at: '2026-10-19T11:00:00Z', authorId: 'alice' })
  })

  it('ignores older messages', () => {
    useConversationStore.getState().noteMessage(msg('old', 'main', '2026-10-19T07:00:00Z', 'alice'))
    expect(useConversationStore.getState().latest.main).toEqual({ at: '2026-10-19T10:00:00Z', authorId: 'bea' })
  })

  it('ignores messages from another conversation', () => {
    useConversationStore.getState().noteMessage({ ...msg('x', 'main', '2026-10-19T12:00:00Z'), conversation_id: 'conv-2' })
    expect(useConversationStore.getState().latest.main?.at).toBe('2026-10-19T10:00:00Z')
  })
})

describe('conversationStore read positions', () => {
  beforeEach(async () => {
    await useConversationStore.getState().load('alice')
  })

  const rp = (over: Partial<ReadPosition>): ReadPosition => ({
    conversation_id: 'conv-1',
    user_id: 'alice',
    space: 'main',
    last_read_at: '2026-10-19T09:30:00Z',
    ...over,
  })

  it('applyReadPosition moves my position forward', () => {
    useConversationStore.getState().applyReadPosition(rp({}), 'alice')
    expect(useConversationStore.getState().readAt.main).toBe('2026-10-19T09:30:00Z')
  })

  it('applyReadPosition ignores other users', () => {
    useConversationStore.getState().applyReadPosition(rp({ user_id: 'bea', space: 'schist' }), 'alice')
    expect(useConversationStore.getState().readAt.schist).toBeNull()
  })

  it('applyReadPosition ignores older times', () => {
    useConversationStore.getState().applyReadPosition(rp({ last_read_at: '2026-10-19T08:00:00Z' }), 'alice')
    expect(useConversationStore.getState().readAt.main).toBe('2026-10-19T09:00:00Z')
  })

  it('markReadLocal is forward-only', () => {
    useConversationStore.getState().markReadLocal('schist', '2026-10-19T09:00:00Z')
    useConversationStore.getState().markReadLocal('schist', '2026-10-19T08:00:00Z')
    expect(useConversationStore.getState().readAt.schist).toBe('2026-10-19T09:00:00Z')
  })
})

describe('conversationStore.getOrCreateSession', () => {
  it('returns the newest visible session', async () => {
    await useConversationStore.getState().load('alice')
    useConversationStore.setState({ activeSession: null })
    expect(await useConversationStore.getState().getOrCreateSession()).toEqual(SESSION)
  })

  it('inserts a session for the conversation when none is visible', async () => {
    await useConversationStore.getState().load('alice')
    useConversationStore.setState({ activeSession: null })
    h.tables.sessions = (ops) =>
      hasOp(ops, 'insert') ? { data: { ...SESSION, id: 'sess-new' }, error: null } : { data: null, error: null }
    const created = await useConversationStore.getState().getOrCreateSession()
    expect(created?.id).toBe('sess-new')
    const insert = h.queries.find((q) => q.table === 'sessions' && hasOp(q.ops, 'insert'))!
    expect(insert.ops).toContainEqual(['insert', [{ conversation_id: 'conv-1', visible: true }]])
    expect(useConversationStore.getState().activeSession?.id).toBe('sess-new')
  })
})

describe('conversationStore lake', () => {
  beforeEach(async () => {
    await useConversationStore.getState().load('alice')
    const { addMessage } = useMessageStore.getState()
    addMessage(spaceKey('conv-1', 'main'), msg('m2', 'main', '2026-10-19T10:00:00Z'))
    addMessage(spaceKey('conv-1', 'schist'), msg('s1', 'schist', '2026-10-19T08:00:00Z'))
  })

  it('dragTheLake clears both spaces before the RPC resolves, then adopts the new session', async () => {
    let resolveRpc!: (r: Result) => void
    h.rpc.mockImplementation((fn: string) =>
      fn === 'drag_the_lake' ? new Promise<Result>((r) => (resolveRpc = r)) : Promise.resolve({ data: [], error: null }),
    )
    const lake = vi.fn()
    setLakeBroadcaster(lake)

    const done = useConversationStore.getState().dragTheLake()
    const { messages } = useMessageStore.getState()
    expect(messages[spaceKey('conv-1', 'main')]).toEqual([])
    expect(messages[spaceKey('conv-1', 'schist')]).toEqual([])
    expect(useConversationStore.getState().latest).toEqual({ main: null, schist: null })
    expect(h.rpc).toHaveBeenCalledWith('drag_the_lake', { p_conversation: 'conv-1' })

    resolveRpc({ data: 'sess-dragged', error: null })
    await done
    expect(useConversationStore.getState().activeSession).toMatchObject({ id: 'sess-dragged', conversation_id: 'conv-1', visible: true })
    expect(lake).toHaveBeenCalledTimes(1)
  })

  it('fillTheLake maps false to wrong and changes nothing', async () => {
    h.rpc.mockReset()
    h.rpc.mockImplementation(async (fn: string) => (fn === 'fill_the_lake' ? { data: false, error: null } : { data: [], error: null }))
    const lake = vi.fn()
    setLakeBroadcaster(lake)
    expect(await useConversationStore.getState().fillTheLake('nope')).toBe('wrong')
    expect(h.rpc).toHaveBeenCalledWith('fill_the_lake', { p_conversation: 'conv-1', p_password: 'nope' })
    expect(h.rpc).toHaveBeenCalledTimes(1) // no reload
    expect(useMessageStore.getState().messages[spaceKey('conv-1', 'main')]).toHaveLength(1)
    expect(lake).not.toHaveBeenCalled()
  })

  it('fillTheLake maps an RPC error to error', async () => {
    h.rpc.mockImplementation(async () => ({ data: null, error: { message: 'boom' } }))
    expect(await useConversationStore.getState().fillTheLake('x')).toBe('error')
  })

  it('fillTheLake on true reloads both spaces and broadcasts', async () => {
    h.rpc.mockImplementation(async (fn: string, args: { p_space?: Space }) => {
      if (fn === 'fill_the_lake') return { data: true, error: null }
      if (fn === 'get_messages') return { data: [msg(`back-${args.p_space}`, args.p_space!, '2026-10-19T12:00:00Z')], error: null }
      return { data: null, error: null }
    })
    const lake = vi.fn()
    setLakeBroadcaster(lake)
    expect(await useConversationStore.getState().fillTheLake('test-lake-password')).toBe('filled')
    const { messages } = useMessageStore.getState()
    expect(messages[spaceKey('conv-1', 'main')].map((m) => m.id)).toEqual(['back-main'])
    expect(messages[spaceKey('conv-1', 'schist')].map((m) => m.id)).toEqual(['back-schist'])
    expect(useConversationStore.getState().latest.schist?.at).toBe('2026-10-19T12:00:00Z')
    expect(lake).toHaveBeenCalledTimes(1)
  })
})

describe('conversationStore.reset', () => {
  it('forgets the conversation and the remembered space', async () => {
    await useConversationStore.getState().load('alice')
    useConversationStore.getState().setActiveSpace('schist')
    useConversationStore.getState().reset()
    const s = useConversationStore.getState()
    expect(s).toMatchObject({ conversation: null, memberIds: [], activeSession: null, activeSpace: 'main' })
    expect(sessionStorage.getItem('activeSpace')).toBeNull()
  })
})
