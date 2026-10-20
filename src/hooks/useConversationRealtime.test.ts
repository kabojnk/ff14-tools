import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConversationHandlers } from '@/lib/conversationRealtime'

const rt = vi.hoisted(() => ({
  handlers: null as ConversationHandlers | null,
  options: undefined as { memberIds?: string[] } | undefined,
  joinConversation: vi.fn(),
  sendLake: vi.fn(),
}))
vi.mock('@/lib/conversationRealtime', () => ({
  joinConversation: (id: string, h: ConversationHandlers, options?: { memberIds?: string[] }) => {
    rt.handlers = h
    rt.options = options
    rt.joinConversation(id)
    return () => {}
  },
  sendLake: rt.sendLake,
}))
const db = vi.hoisted(() => ({ loads: [] as string[][] }))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        in: (_c: string, ids: string[]) => {
          db.loads.push(ids)
          return Promise.resolve({ data: [], error: null })
        },
      }),
    }),
  },
}))

import { useConversationRealtime } from '@/hooks/useConversationRealtime'
import { useAuthStore } from '@/stores/authStore'
import { useConversationStore } from '@/stores/conversationStore'
import { useTypingStore } from '@/stores/typingStore'
import { useProfileStore } from '@/stores/profileStore'
import type { Message } from '@/types'

const bea = { user_id: 'u2', nickname: 'Bea' }

beforeEach(() => {
  rt.handlers = null
  useTypingStore.getState().clear()
  useAuthStore.setState({ user: { id: 'u1' } as never })
  db.loads.length = 0
  useProfileStore.getState().reset()
  useConversationStore.setState({ conversation: { id: 'c1' } as never, memberIds: ['u1', 'u2'] })
  renderHook(() => useConversationRealtime())
})

const message = (over: Partial<Message>) =>
  ({ id: 'm1', conversation_id: 'c1', space: 'main', author_id: 'u2', created_at: new Date().toISOString(), ...over }) as Message

describe('useConversationRealtime typing', () => {
  it("clears the author's typing indicator in that space when their message arrives", () => {
    rt.handlers!.onTyping('main', bea)
    rt.handlers!.onTyping('schist', bea)
    rt.handlers!.onMessage(message({ space: 'main' }), 'new')
    const { typing } = useTypingStore.getState()
    expect(typing.main).toEqual([])
    expect(typing.schist.map((t) => t.user_id)).toEqual(['u2'])
  })

  it("a message's second copy (the database change after the broadcast) leaves their new typing alone", () => {
    rt.handlers!.onTyping('main', bea)
    rt.handlers!.onMessage(message({ id: 'm9', space: 'main' }), 'new')
    expect(useTypingStore.getState().typing.main).toEqual([])
    rt.handlers!.onTyping('main', bea) // they start on the next one…
    rt.handlers!.onMessage(message({ id: 'm9', space: 'main' }), 'new') // …and the late copy arrives
    expect(useTypingStore.getState().typing.main.map((t) => t.user_id)).toEqual(['u2'])
  })

  it('clears the indicator on an explicit typing stop', () => {
    rt.handlers!.onTyping('schist', bea)
    rt.handlers!.onTypingStop('schist', 'u2')
    expect(useTypingStore.getState().typing.schist).toEqual([])
  })
})

describe('useConversationRealtime profiles', () => {
  it('binds the members and loads their profiles', () => {
    expect(rt.options).toEqual({ memberIds: ['u1', 'u2'] })
    expect(db.loads).toEqual([['u1', 'u2']])
  })

  it('stores a changed profile without its PIN', () => {
    rt.handlers!.onProfile({ id: 'u2', nickname: 'Bea', lock_pin: '1234' })
    const stored = useProfileStore.getState().profiles.u2
    expect(stored?.nickname).toBe('Bea')
    expect(Object.keys(stored as object)).not.toContain('lock_pin')
  })

  it('reloads the profiles after a rejoin (updates may have been missed)', () => {
    useConversationStore.setState({ reloadAfterLake: vi.fn(async () => {}), refreshPartnerReadAt: vi.fn(async () => {}) })
    rt.handlers!.onStatus('SUBSCRIBED', true)
    expect(db.loads).toEqual([['u1', 'u2'], ['u1', 'u2']])
  })
})

describe('useConversationRealtime read positions', () => {
  it.each([false, true])('catches up on the partner read positions once live (rejoined: %s)', (rejoined) => {
    const refreshPartnerReadAt = vi.fn(async () => {})
    useConversationStore.setState({ reloadAfterLake: vi.fn(async () => {}), refreshLatest: vi.fn(async () => {}), refreshPartnerReadAt })
    rt.handlers!.onStatus('JOINING', false)
    expect(refreshPartnerReadAt).not.toHaveBeenCalled()
    rt.handlers!.onStatus('SUBSCRIBED', rejoined)
    expect(refreshPartnerReadAt).toHaveBeenCalledWith('u1')
  })
})
