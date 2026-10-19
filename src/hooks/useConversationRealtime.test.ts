import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConversationHandlers } from '@/lib/conversationRealtime'

const rt = vi.hoisted(() => ({
  handlers: null as ConversationHandlers | null,
  joinConversation: vi.fn(),
  sendLake: vi.fn(),
}))
vi.mock('@/lib/conversationRealtime', () => ({
  joinConversation: (id: string, h: ConversationHandlers) => {
    rt.handlers = h
    rt.joinConversation(id)
    return () => {}
  },
  sendLake: rt.sendLake,
}))
vi.mock('@/lib/supabase', () => ({ supabase: {} }))

import { useConversationRealtime } from '@/hooks/useConversationRealtime'
import { useAuthStore } from '@/stores/authStore'
import { useConversationStore } from '@/stores/conversationStore'
import { useTypingStore } from '@/stores/typingStore'
import type { Message } from '@/types'

const bea = { user_id: 'u2', nickname: 'Bea' }

beforeEach(() => {
  rt.handlers = null
  useTypingStore.getState().clear()
  useAuthStore.setState({ user: { id: 'u1' } as never })
  useConversationStore.setState({ conversation: { id: 'c1' } as never })
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

  it('clears the indicator on an explicit typing stop', () => {
    rt.handlers!.onTyping('schist', bea)
    rt.handlers!.onTypingStop('schist', 'u2')
    expect(useTypingStore.getState().typing.schist).toEqual([])
  })
})
