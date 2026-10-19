import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const rt = vi.hoisted(() => ({ sendTyping: vi.fn(), sendTypingStop: vi.fn() }))
vi.mock('@/lib/conversationRealtime', () => rt)
vi.mock('@/lib/supabase', () => ({ supabase: {} }))

import { useTyping } from '@/hooks/useTyping'
import { useAuthStore } from '@/stores/authStore'

const alice = { user_id: 'u1', nickname: 'Alice' }

beforeEach(() => {
  rt.sendTyping.mockReset()
  rt.sendTypingStop.mockReset()
  useAuthStore.setState({
    user: { id: 'u1' } as never,
    profile: { id: 'u1', nickname: 'Alice' } as never,
  })
})

describe('useTyping', () => {
  it('throttles typing announcements', () => {
    const { result } = renderHook(() => useTyping('main'))
    act(() => {
      result.current.sendTyping()
      result.current.sendTyping()
    })
    expect(rt.sendTyping).toHaveBeenCalledTimes(1)
    expect(rt.sendTyping).toHaveBeenCalledWith('main', alice)
  })

  it('stopTyping announces the stop and lets the next keystroke announce again at once', () => {
    const { result } = renderHook(() => useTyping('main'))
    act(() => result.current.sendTyping())
    act(() => result.current.stopTyping())
    expect(rt.sendTypingStop).toHaveBeenCalledWith('main', 'u1')

    act(() => result.current.sendTyping())
    expect(rt.sendTyping).toHaveBeenCalledTimes(2)
  })

  it('stopTyping is silent when nothing was announced', () => {
    const { result } = renderHook(() => useTyping('main'))
    act(() => result.current.stopTyping())
    expect(rt.sendTypingStop).not.toHaveBeenCalled()
  })
})
