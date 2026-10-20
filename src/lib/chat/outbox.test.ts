import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Message } from '@/types'

const { sendMessageEvent } = vi.hoisted(() => ({ sendMessageEvent: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }))
vi.mock('@/lib/conversationRealtime', () => ({ sendMessageEvent }))

import { retryOutgoing, sendOutgoing } from '@/lib/chat/outbox'
import { useConversationStore } from '@/stores/conversationStore'
import { useMessageStore } from '@/stores/messageStore'
import { spaceKey } from '@/lib/spaces'

const KEY = spaceKey('conv-1', 'main')
const initialConv = useConversationStore.getState()
const initialMessages = useMessageStore.getState()

function server(over: Partial<Message>): Message {
  return {
    id: 'x',
    conversation_id: 'conv-1',
    space: 'main',
    channel_id: null,
    session_id: 'sess-1',
    author_id: 'alice',
    content: 'hi',
    attachments: [],
    type: 'text',
    edited_at: null,
    deleted: false,
    reply_to: null,
    created_at: '2026-10-19T12:00:00Z',
    ...over,
  }
}

const sendMessage = vi.fn()
const noteMessage = vi.fn()

beforeEach(() => {
  useConversationStore.setState(initialConv, true)
  useMessageStore.setState(initialMessages, true)
  sendMessage.mockReset()
  noteMessage.mockReset()
  sendMessageEvent.mockReset()
  useConversationStore.setState({
    conversation: { id: 'conv-1', title: null, archived: false, created_by: null, created_at: '2026-01-01T00:00:00Z' },
    activeSession: { id: 'sess-1', conversation_id: 'conv-1', channel_id: null, visible: true, created_by: 'alice', created_at: '' },
    sendMessage,
    noteMessage,
  })
})

const out = { authorId: 'alice', space: 'main' as const, content: 'hi', attachments: [], type: 'text' as const, replyTo: 'm0' }

describe('sendOutgoing', () => {
  it('shows the message at once as sending, under a client-generated id', async () => {
    let resolve!: (m: Message | null) => void
    sendMessage.mockReturnValue(new Promise((r) => (resolve = r)))
    const done = sendOutgoing(out)

    const [pending] = useMessageStore.getState().messages[KEY]
    expect(pending).toMatchObject({ author_id: 'alice', content: 'hi', reply_to: 'm0', localState: 'sending' })
    expect(pending.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({ id: pending.id, replyTo: 'm0', content: 'hi' }))

    resolve(server({ id: pending.id }))
    await done
    const [confirmed] = useMessageStore.getState().messages[KEY]
    expect(confirmed.localState).toBeUndefined()
    expect(noteMessage).toHaveBeenCalledWith(expect.objectContaining({ id: pending.id }))
    expect(sendMessageEvent).toHaveBeenCalledWith('new', expect.objectContaining({ id: pending.id }))
  })

  it('marks it failed (kept, with its text) when the send fails', async () => {
    sendMessage.mockResolvedValue(null)
    await sendOutgoing(out)
    const [failed] = useMessageStore.getState().messages[KEY]
    expect(failed).toMatchObject({ content: 'hi', localState: 'failed' })
    expect(sendMessageEvent).not.toHaveBeenCalled()
  })

  it('marks it failed when the send throws', async () => {
    sendMessage.mockRejectedValue(new Error('offline'))
    await sendOutgoing(out)
    expect(useMessageStore.getState().messages[KEY][0].localState).toBe('failed')
  })
})

describe('retryOutgoing', () => {
  it('resends with the same id and confirms it', async () => {
    sendMessage.mockResolvedValueOnce(null)
    await sendOutgoing(out)
    const id = useMessageStore.getState().messages[KEY][0].id

    sendMessage.mockResolvedValueOnce(server({ id }))
    const retry = retryOutgoing(KEY, id)
    expect(useMessageStore.getState().messages[KEY][0].localState).toBe('sending')
    await retry
    expect(sendMessage).toHaveBeenLastCalledWith(expect.objectContaining({ id, content: 'hi', replyTo: 'm0' }))
    expect(useMessageStore.getState().messages[KEY]).toHaveLength(1)
    expect(useMessageStore.getState().messages[KEY][0].localState).toBeUndefined()
  })

  it('does nothing for a message that is not failed', async () => {
    useMessageStore.getState().addMessage(KEY, server({ id: 'done' }))
    await retryOutgoing(KEY, 'done')
    expect(sendMessage).not.toHaveBeenCalled()
  })
})
