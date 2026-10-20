import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Message, Space } from '@/types'

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }))

vi.mock('@/lib/supabase', () => ({
  supabase: { rpc: mockRpc, from: vi.fn() },
}))

import { useMessageStore } from '@/stores/messageStore'
import { spaceKey } from '@/lib/spaces'

const initialState = useMessageStore.getState()

function msg(id: string, space: Space, created_at = '2026-10-19T10:00:00Z'): Message {
  return {
    id,
    conversation_id: 'conv-1',
    space,
    channel_id: null,
    session_id: 's1',
    author_id: 'alice',
    content: id,
    attachments: [],
    type: 'text',
    edited_at: null,
    deleted: false,
    reply_to: null,
    created_at,
  }
}

const MAIN = spaceKey('conv-1', 'main')
const SCHIST = spaceKey('conv-1', 'schist')

beforeEach(() => {
  useMessageStore.setState(initialState, true)
  mockRpc.mockReset()
})

describe('messageStore', () => {
  it('keeps messages separated per space', () => {
    const { addMessage } = useMessageStore.getState()
    addMessage(MAIN, msg('m1', 'main'))
    addMessage(SCHIST, msg('s1', 'schist'))
    addMessage(MAIN, msg('m2', 'main'))
    const { messages } = useMessageStore.getState()
    expect(messages[MAIN].map((m) => m.id)).toEqual(['m1', 'm2'])
    expect(messages[SCHIST].map((m) => m.id)).toEqual(['s1'])
  })

  it('ignores a duplicate message id', () => {
    const { addMessage } = useMessageStore.getState()
    addMessage(MAIN, msg('m1', 'main'))
    addMessage(MAIN, msg('m1', 'main'))
    expect(useMessageStore.getState().messages[MAIN]).toHaveLength(1)
  })

  it('fetchMessages loads one space through get_messages, oldest first', async () => {
    mockRpc.mockResolvedValue({
      data: [msg('new', 'schist', '2026-10-19T10:00:02Z'), msg('old', 'schist', '2026-10-19T10:00:01Z')],
      error: null,
    })
    await useMessageStore.getState().fetchMessages('conv-1', 'schist')
    expect(mockRpc).toHaveBeenCalledWith('get_messages', { p_conversation: 'conv-1', p_space: 'schist', p_limit: 50 })
    const { messages, loading } = useMessageStore.getState()
    expect(messages[SCHIST].map((m) => m.id)).toEqual(['old', 'new'])
    expect(messages[MAIN]).toBeUndefined()
    expect(loading).toBe(false)
  })

  it('fetchMessages keeps what it had when the RPC fails', async () => {
    useMessageStore.getState().addMessage(MAIN, msg('m1', 'main'))
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await useMessageStore.getState().fetchMessages('conv-1', 'main')
    expect(useMessageStore.getState().messages[MAIN].map((m) => m.id)).toEqual(['m1'])
    expect(useMessageStore.getState().loading).toBe(false)
  })

  it('fetchMessages keeps local pending and failed messages the server has not returned', async () => {
    const { addPending, failPending } = useMessageStore.getState()
    addPending(MAIN, msg('p1', 'main', '2026-10-19T10:00:05Z'))
    addPending(MAIN, msg('p2', 'main', '2026-10-19T10:00:06Z'))
    failPending(MAIN, 'p2')
    mockRpc.mockResolvedValue({ data: [msg('p1', 'main', '2026-10-19T10:00:04Z'), msg('old', 'main')], error: null })
    await useMessageStore.getState().fetchMessages('conv-1', 'main')
    const list = useMessageStore.getState().messages[MAIN]
    expect(list.map((m) => [m.id, m.localState])).toEqual([
      ['old', undefined],
      ['p1', undefined],
      ['p2', 'failed'],
    ])
  })

  it('clearConversation empties both spaces of that conversation only', () => {
    const { addMessage } = useMessageStore.getState()
    addMessage(MAIN, msg('m1', 'main'))
    addMessage(SCHIST, msg('s1', 'schist'))
    addMessage(spaceKey('conv-2', 'main'), msg('x', 'main'))
    useMessageStore.getState().clearConversation('conv-1')
    const { messages } = useMessageStore.getState()
    expect(messages[MAIN]).toEqual([])
    expect(messages[SCHIST]).toEqual([])
    expect(messages[spaceKey('conv-2', 'main')]).toHaveLength(1)
  })

  describe('pending messages', () => {
    it('addPending appends the message as sending, under its client-generated id', () => {
      useMessageStore.getState().addMessage(MAIN, msg('m1', 'main'))
      useMessageStore.getState().addPending(MAIN, msg('client-1', 'main'))
      const list = useMessageStore.getState().messages[MAIN]
      expect(list.map((m) => m.id)).toEqual(['m1', 'client-1'])
      expect(list[1].localState).toBe('sending')
    })

    it('confirmPending replaces the pending message in place with the server row', () => {
      const { addPending, addMessage, confirmPending } = useMessageStore.getState()
      addPending(MAIN, msg('client-1', 'main'))
      addMessage(MAIN, msg('later', 'main', '2026-10-19T10:00:09Z'))
      confirmPending(MAIN, 'client-1', { ...msg('client-1', 'main', '2026-10-19T10:00:01Z'), content: 'server' })
      const list = useMessageStore.getState().messages[MAIN]
      expect(list.map((m) => m.id)).toEqual(['client-1', 'later'])
      expect(list[0]).toMatchObject({ content: 'server', created_at: '2026-10-19T10:00:01Z' })
      expect(list[0].localState).toBeUndefined()
    })

    it('failPending marks it failed, and a retry can mark it sending again', () => {
      const { addPending, failPending, retryPending } = useMessageStore.getState()
      addPending(MAIN, msg('client-1', 'main'))
      failPending(MAIN, 'client-1')
      expect(useMessageStore.getState().messages[MAIN][0].localState).toBe('failed')
      retryPending(MAIN, 'client-1')
      expect(useMessageStore.getState().messages[MAIN][0].localState).toBe('sending')
    })

    it('a realtime echo with the same id merges into the pending message, with no duplicate', () => {
      const { addPending, addMessage } = useMessageStore.getState()
      addPending(MAIN, msg('client-1', 'main'))
      addMessage(MAIN, { ...msg('client-1', 'main', '2026-10-19T10:00:03Z'), content: 'echo' })
      const list = useMessageStore.getState().messages[MAIN]
      expect(list).toHaveLength(1)
      expect(list[0]).toMatchObject({ content: 'echo', created_at: '2026-10-19T10:00:03Z' })
      expect(list[0].localState).toBeUndefined()
    })

    it('a confirm after the echo still leaves one confirmed message', () => {
      const { addPending, addMessage, confirmPending } = useMessageStore.getState()
      addPending(MAIN, msg('client-1', 'main'))
      addMessage(MAIN, msg('client-1', 'main'))
      confirmPending(MAIN, 'client-1', msg('client-1', 'main'))
      expect(useMessageStore.getState().messages[MAIN]).toHaveLength(1)
    })
  })

  describe('fetchOlder', () => {
    it('loads the page before the oldest loaded message and prepends it', async () => {
      useMessageStore.getState().addMessage(MAIN, msg('m5', 'main', '2026-10-19T10:00:05Z'))
      mockRpc.mockResolvedValue({
        data: [msg('m4', 'main', '2026-10-19T10:00:04Z'), msg('m3', 'main', '2026-10-19T10:00:03Z')],
        error: null,
      })
      const more = await useMessageStore.getState().fetchOlder('conv-1', 'main')
      expect(mockRpc).toHaveBeenCalledWith('get_messages', {
        p_conversation: 'conv-1',
        p_space: 'main',
        p_limit: 50,
        p_before: '2026-10-19T10:00:05Z',
      })
      expect(useMessageStore.getState().messages[MAIN].map((m) => m.id)).toEqual(['m3', 'm4', 'm5'])
      expect(more).toBe(false) // fewer than a page
    })

    it('says there is nothing more when the RPC fails or returns nothing', async () => {
      mockRpc.mockResolvedValue({ data: [], error: null })
      expect(await useMessageStore.getState().fetchOlder('conv-1', 'main')).toBe(false)
      mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
      expect(await useMessageStore.getState().fetchOlder('conv-1', 'main')).toBe(false)
    })
  })
})
