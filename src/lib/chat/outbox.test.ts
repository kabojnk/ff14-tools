import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Message } from '@/types'

const { sendMessageEvent } = vi.hoisted(() => ({ sendMessageEvent: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }))
vi.mock('@/lib/conversationRealtime', () => ({ sendMessageEvent }))

import { forgetUpload, retryOutgoing, sendOutgoing } from '@/lib/chat/outbox'
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

describe('upload steps (voice memos)', () => {
  const VOICE = { url: 'https://cdn/voice/x.m4a', type: 'audio' as const, filename: 'voice-x.m4a', size: 10, spoiler: false }
  const voiceMessage = { authorId: 'alice', space: 'main' as const, content: null, attachments: [{ ...VOICE, url: 'blob:local' }], type: 'text' as const, replyTo: null }
  const key = spaceKey('conv-1', 'main')

  it('runs the upload step before the insert, tells the caller the id first, and a retry reuses a finished upload', async () => {
    const prepare = vi.fn(async () => [VOICE])
    const onAdded = vi.fn()
    sendMessage.mockResolvedValueOnce(null) // the insert fails once
    const id = await sendOutgoing(voiceMessage, { prepare, onAdded })
    expect(onAdded).toHaveBeenCalledWith(id)
    expect(sendMessage.mock.calls[0][0].attachments).toEqual([VOICE])
    await retryOutgoing(key, id!)
    expect(prepare).toHaveBeenCalledTimes(1)
    expect(sendMessage.mock.calls[1][0].attachments).toEqual([VOICE])
  })

  it('a failed upload fails the message without inserting, and Retry uploads again', async () => {
    const prepare = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([VOICE])
    const id = await sendOutgoing(voiceMessage, { prepare })
    expect(useMessageStore.getState().messages[key]?.find((m) => m.id === id)?.localState).toBe('failed')
    expect(sendMessage).not.toHaveBeenCalled()
    await retryOutgoing(key, id!)
    expect(prepare).toHaveBeenCalledTimes(2)
  })

  it('an upload forgotten while in flight (the disguise) sends nothing and fails nothing', async () => {
    let finish: (a: typeof VOICE[]) => void = () => {}
    const prepare = vi.fn(() => new Promise<typeof VOICE[]>((r) => (finish = r)))
    let added = ''
    const sending = sendOutgoing(voiceMessage, { prepare, onAdded: (id) => (added = id) })
    await Promise.resolve()
    forgetUpload(added)
    useMessageStore.getState().removeMessage(key, added)
    finish([VOICE])
    await sending
    expect(sendMessage).not.toHaveBeenCalled()
    expect(useMessageStore.getState().messages[key]?.some((m) => m.id === added) ?? false).toBe(false)
  })

  it('never inserts a local blob: copy without its upload step', async () => {
    const id = await sendOutgoing(voiceMessage, { prepare: async () => Promise.reject(new Error('offline')) })
    forgetUpload(id!)
    await retryOutgoing(key, id!)
    expect(sendMessage).not.toHaveBeenCalled()
    expect(useMessageStore.getState().messages[key]?.find((m) => m.id === id)?.localState).toBe('failed')
  })
})
