import { beforeEach, describe, expect, it, vi } from 'vitest'

const { signOut } = vi.hoisted(() => ({ signOut: vi.fn() }))

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { signOut } },
}))
vi.mock('@/lib/conversationRealtime', () => ({ leaveConversation: vi.fn() }))

import { useAuthStore } from '@/stores/authStore'

beforeEach(() => {
  signOut.mockReset().mockResolvedValue({ error: null })
})

describe('authStore.signOut', () => {
  it('forgets the device PIN flag, so the next login on this phone opens normally', async () => {
    localStorage.setItem('hasPin', '1')
    await useAuthStore.getState().signOut()
    expect(localStorage.getItem('hasPin')).toBeNull()
    expect(signOut).toHaveBeenCalled()
  })

  it('still signs out when storage throws', async () => {
    const spy = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('denied')
    })
    await expect(useAuthStore.getState().signOut()).resolves.toBeUndefined()
    expect(signOut).toHaveBeenCalled()
    spy.mockRestore()
  })
})
