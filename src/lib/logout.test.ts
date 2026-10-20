import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn(), auth: { signOut: vi.fn() } },
}))

import { logOut } from '@/lib/logout'
import { useAuthStore } from '@/stores/authStore'
import { useUiStore } from '@/stores/uiStore'

describe('logOut', () => {
  beforeEach(() => {
    useUiStore.setState({ eepMode: true })
  })

  it('signs out, then clears the PIN and leaves eep mode, in that order', async () => {
    const calls: string[] = []
    const signOut = vi.fn(async () => { calls.push('signOut') })
    const clearPin = vi.fn(() => { calls.push('clearPin') })
    const setEepMode = vi.fn((on: boolean) => { calls.push(`setEepMode(${on})`) })
    useAuthStore.setState({ signOut })
    useUiStore.setState({ clearPin, setEepMode })

    await logOut()

    expect(calls).toEqual(['signOut', 'clearPin', 'setEepMode(false)'])
  })
})
