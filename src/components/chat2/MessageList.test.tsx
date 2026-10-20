import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@supabase/supabase-js'

vi.mock('@/lib/supabase', () => ({ supabase: { rpc: vi.fn(async () => ({ error: null })) } }))
vi.mock('@/lib/conversationRealtime', () => ({ sendMessageEvent: vi.fn(), sendTyping: vi.fn(), sendTypingStop: vi.fn() }))
vi.mock('@/hooks/usePinnedMessages', () => ({
  usePinnedMessages: () => ({ pinnedIds: new Set<string>(), pinMessage: vi.fn(), unpinMessage: vi.fn() }),
}))

import { MessageList } from '@/components/chat2/MessageList'
import { useAuthStore } from '@/stores/authStore'
import { useConversationStore } from '@/stores/conversationStore'
import { useEmojiStore } from '@/stores/emojiStore'
import { useJumpStore } from '@/stores/jumpStore'
import { useMessageStore } from '@/stores/messageStore'
import { useReactionStore } from '@/stores/reactionStore'
import type { Message } from '@/types'

const KEY = 'conv:schist'
const PAGE = 5

function msg(n: number): Message {
  return {
    id: `m${n}`,
    conversation_id: 'conv',
    space: 'schist',
    channel_id: null,
    session_id: 's',
    author_id: n % 2 ? 'bea' : 'alice',
    content: `message ${n}`,
    attachments: [],
    type: 'text',
    edited_at: null,
    deleted: false,
    reply_to: null,
    // One a minute, oldest first.
    created_at: new Date(Date.UTC(2026, 9, 1, 9, n)).toISOString(),
  }
}

/** 0..total-1, oldest first. The store starts with the newest page; each fetchOlder prepends the next page back. */
function seed(total: number) {
  const all = Array.from({ length: total }, (_, i) => msg(i))
  let loaded = total - PAGE
  const fetchOlder = vi.fn(async () => {
    const from = Math.max(0, loaded - PAGE)
    const page = all.slice(from, loaded)
    loaded = from
    useMessageStore.setState((s) => ({ messages: { ...s.messages, [KEY]: [...page, ...(s.messages[KEY] ?? [])] } }))
    return loaded > 0
  })
  useMessageStore.setState({
    messages: { [KEY]: all.slice(loaded) },
    fetchMessages: vi.fn(async () => {}),
    fetchOlder,
  })
  return { all, fetchOlder }
}

const scrollIntoView = vi.fn()
const scrollTo = vi.fn()

beforeEach(() => {
  useAuthStore.setState({ user: { id: 'alice' } as User })
  useConversationStore.setState({
    memberIds: ['alice', 'bea'],
    readAt: { main: null, schist: null },
    partnerReadAt: { main: null, schist: null },
  } as never)
  useEmojiStore.setState({ load: async () => {} })
  useReactionStore.setState({ loadFor: async () => {} } as never)
  useJumpStore.getState().reset()
  Element.prototype.scrollIntoView = scrollIntoView
  Element.prototype.scrollTo = scrollTo as never
  scrollIntoView.mockClear()
  scrollTo.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

const row = (id: string) => document.querySelector(`[data-message-id="${id}"]`)

describe('MessageList jumps from outside the list', () => {
  it('pages back until it finds a message three pages back, then flashes it', async () => {
    const { all, fetchOlder } = seed(PAGE * 5)
    const target = all[PAGE * 2 - 1] // in the third page back
    render(<MessageList conversationId="conv" space="schist" />)
    await waitFor(() => expect(row(all[all.length - 1].id)).not.toBeNull())

    act(() => useJumpStore.getState().request({ messageId: target.id, space: 'schist', created_at: target.created_at }))

    await waitFor(() => expect(row(target.id)?.className).toContain('msg-flash'))
    expect(fetchOlder).toHaveBeenCalledTimes(3)
    expect(useJumpStore.getState().pending).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('stops paging once it has loaded past the time, and says the message is gone', async () => {
    const { all, fetchOlder } = seed(PAGE * 5)
    const gone = { id: 'deleted', created_at: all[PAGE * 3].created_at } // a time in the second page back
    render(<MessageList conversationId="conv" space="schist" />)
    await waitFor(() => expect(row(all[all.length - 1].id)).not.toBeNull())

    act(() => useJumpStore.getState().request({ messageId: gone.id, space: 'schist', created_at: gone.created_at }))

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent("Couldn't find that message. It may have been deleted."))
    expect(fetchOlder).toHaveBeenCalledTimes(2)
  })

  it('leaves a request for the other space alone', async () => {
    const { all } = seed(PAGE)
    render(<MessageList conversationId="conv" space="schist" />)
    await waitFor(() => expect(row(all[all.length - 1].id)).not.toBeNull())
    act(() => useJumpStore.getState().request({ messageId: 'x', space: 'main', created_at: all[0].created_at }))
    await act(async () => {})
    expect(useJumpStore.getState().pending).not.toBeNull()
  })

  it('takes a request made before it opened (a jump that switched space)', async () => {
    const { all } = seed(PAGE)
    useJumpStore.getState().request({ messageId: all[1].id, space: 'schist', created_at: all[1].created_at })
    render(<MessageList conversationId="conv" space="schist" />)
    await waitFor(() => expect(row(all[1].id)?.className).toContain('msg-flash'))
    expect(useJumpStore.getState().pending).toBeNull()
  })

  it('jumps again when the same message is asked for twice', async () => {
    const { all } = seed(PAGE)
    render(<MessageList conversationId="conv" space="schist" />)
    await waitFor(() => expect(row(all[0].id)).not.toBeNull())
    const ask = () => act(() => useJumpStore.getState().request({ messageId: all[1].id, space: 'schist', created_at: all[1].created_at }))
    ask()
    await waitFor(() => expect(scrollTo).toHaveBeenCalled())
    scrollTo.mockClear()
    ask()
    await waitFor(() => expect(scrollTo).toHaveBeenCalled())
  })
})
