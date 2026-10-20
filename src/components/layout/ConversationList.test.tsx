import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@supabase/supabase-js'

type Op = [string, unknown[]]

// A chainable fake of the query builder: profiles answer with Bea, message counts with `counts[space]`.
const h = vi.hoisted(() => {
  const queries: { table: string; ops: Op[] }[] = []
  const counts: Record<string, number> = {}
  function from(table: string) {
    const ops: Op[] = []
    queries.push({ table, ops })
    const result = () => {
      if (table === 'profiles') {
        return { data: { id: 'bea', nickname: 'Bea', avatar_url: null, presence_override: null, last_seen_at: null }, error: null }
      }
      const space = ops.find(([n, a]) => n === 'eq' && a[0] === 'space')?.[1][1] as string
      return { data: null, count: counts[space] ?? 0, error: null }
    }
    const builder: object = new Proxy(
      {},
      {
        get(_t, prop: string) {
          if (prop === 'then') return (res: (r: unknown) => unknown) => Promise.resolve(result()).then(res)
          return (...args: unknown[]) => {
            ops.push([prop, args])
            return builder
          }
        },
      },
    )
    return builder
  }
  return { queries, counts, from }
})

vi.mock('@/lib/supabase', () => ({ supabase: { from: h.from } }))

import { ConversationList } from '@/components/layout/ConversationList'
import { useAuthStore } from '@/stores/authStore'
import { useConversationStore } from '@/stores/conversationStore'
import { useProfileStore } from '@/stores/profileStore'

const CONV = { id: 'conv-1', title: null, archived: false, created_by: null, created_at: '2026-01-01T00:00:00Z' }
const initialConv = useConversationStore.getState()

beforeEach(() => {
  h.queries.length = 0
  for (const k of Object.keys(h.counts)) delete h.counts[k]
  useConversationStore.setState(initialConv, true)
  useAuthStore.setState({ user: { id: 'alice' } as User })
  useProfileStore.setState({ profiles: { bea: { id: 'bea', nickname: 'Bea', avatar_url: null, presence_override: null, last_seen_at: null } as never } })
})

function withConversation(over: Partial<ReturnType<typeof useConversationStore.getState>> = {}) {
  useConversationStore.setState({
    conversation: CONV,
    memberIds: ['alice', 'bea'],
    latest: {
      main: { at: '2026-10-19T09:00:00Z', authorId: 'bea', preview: 'older in main' },
      schist: { at: '2026-10-19T10:00:00Z', authorId: 'bea', preview: 'bringing snacks 🍪' },
    },
    readAt: { main: '2026-10-19T09:30:00Z', schist: null },
    ...over,
  })
}

describe('ConversationList', () => {
  it('shows the partner, the newest message across both spaces and an unread count', async () => {
    h.counts.schist = 2
    withConversation()
    render(<ConversationList />)
    const row = await screen.findByRole('button', { name: /Bea/ })
    expect(row).toHaveTextContent('bringing snacks 🍪')
    expect(row).toHaveAttribute('data-unread', 'true')
    await waitFor(() => expect(screen.getByLabelText('2 unread')).toHaveTextContent('2'))
    // Only the unread space is counted, and never my own messages.
    const countQueries = h.queries.filter((q) => q.table === 'messages')
    expect(countQueries).toHaveLength(1)
    expect(countQueries[0].ops).toContainEqual(['neq', ['author_id', 'alice']])
  })

  it('reads the partner from the live profile store, with no query of its own', async () => {
    withConversation()
    render(<ConversationList />)
    await screen.findByRole('button', { name: /Bea/ })
    expect(h.queries.filter((q) => q.table === 'profiles')).toHaveLength(0)
    act(() => useProfileStore.getState().apply({ id: 'bea', nickname: 'Bea renamed' }))
    expect(screen.getByRole('button', { name: /Bea renamed/ })).toBeInTheDocument()
  })

  it('shows no badge when both spaces are read', async () => {
    withConversation({ readAt: { main: '2026-10-19T11:00:00Z', schist: '2026-10-19T11:00:00Z' } })
    render(<ConversationList />)
    const row = await screen.findByRole('button', { name: /Bea/ })
    expect(row).toHaveAttribute('data-unread', 'false')
    expect(screen.queryByLabelText(/unread/)).toBeNull()
    expect(h.queries.filter((q) => q.table === 'messages')).toHaveLength(0)
  })

  it('opens the conversation', async () => {
    withConversation()
    const onOpen = vi.fn()
    render(<ConversationList onOpen={onOpen} />)
    fireEvent.click(await screen.findByRole('button', { name: /Bea/ }))
    expect(onOpen).toHaveBeenCalled()
  })

  it('says so when there is no conversation', () => {
    render(<ConversationList />)
    expect(screen.getByText('No conversation yet')).toBeInTheDocument()
  })
})
