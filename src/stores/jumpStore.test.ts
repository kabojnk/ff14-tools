import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: { auth: { signOut: vi.fn(async () => ({ error: null })) } } }))
vi.mock('@/lib/conversationRealtime', () => ({ leaveConversation: vi.fn() }))

import { JUMP_MAX_AGE_MS, useJumpStore } from '@/stores/jumpStore'
import { useAuthStore } from '@/stores/authStore'

const target = { messageId: 'm1', space: 'schist' as const, created_at: '2026-10-03T09:14:00Z' }

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-20T12:00:00Z'))
  useJumpStore.getState().reset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('jumpStore', () => {
  it('stores a request with the time it was made', () => {
    useJumpStore.getState().request(target)
    expect(useJumpStore.getState().pending).toEqual({ ...target, at: Date.now() })
  })

  it('take returns the request once for its own space, then clears it', () => {
    useJumpStore.getState().request(target)
    expect(useJumpStore.getState().take('main')).toBeNull()
    expect(useJumpStore.getState().pending).not.toBeNull()

    expect(useJumpStore.getState().take('schist')).toEqual({ messageId: 'm1', created_at: target.created_at })
    expect(useJumpStore.getState().pending).toBeNull()
    expect(useJumpStore.getState().take('schist')).toBeNull()
  })

  it('ignores (and clears) a request older than 10 seconds', () => {
    useJumpStore.getState().request(target)
    vi.advanceTimersByTime(JUMP_MAX_AGE_MS + 1)
    expect(useJumpStore.getState().take('schist')).toBeNull()
    expect(useJumpStore.getState().pending).toBeNull()
  })

  it('a repeat request for the same message is a new request', () => {
    useJumpStore.getState().request(target)
    const first = useJumpStore.getState().pending
    useJumpStore.getState().take('schist')
    useJumpStore.getState().request(target)
    const second = useJumpStore.getState().pending
    expect(second).not.toBeNull()
    expect(second).not.toBe(first)
  })

  it('reset drops a pending request', () => {
    useJumpStore.getState().request(target)
    useJumpStore.getState().reset()
    expect(useJumpStore.getState().pending).toBeNull()
  })

  it('signing out drops a pending request', async () => {
    useJumpStore.getState().request(target)
    await useAuthStore.getState().signOut()
    expect(useJumpStore.getState().pending).toBeNull()
  })
})
