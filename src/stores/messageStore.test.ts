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
})
