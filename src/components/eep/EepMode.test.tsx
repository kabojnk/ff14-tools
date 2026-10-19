import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@supabase/supabase-js'

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn(), auth: { signOut: vi.fn() } },
}))

import { EepMode } from '@/components/eep/EepMode'
import { useUiStore } from '@/stores/uiStore'
import { useAuthStore } from '@/stores/authStore'

const PASSPHRASE = 'open sesame'
const initialUi = useUiStore.getState()

function enterPassphrase(value: string) {
  fireEvent.change(screen.getByLabelText('Or enter in a custom raid'), { target: { value } })
  fireEvent.click(screen.getByRole('button', { name: 'Add' }))
}

beforeEach(() => {
  useUiStore.setState(initialUi, true)
  useUiStore.setState({ eepMode: true, eepPassphrase: PASSPHRASE })
  useAuthStore.setState({ user: { id: 'me' } as User })
})

describe('EepMode passphrase', () => {
  it('opens the chat when no PIN lock is on', () => {
    render(<EepMode />)
    enterPassphrase(PASSPHRASE)
    expect(useUiStore.getState().eepMode).toBe(false)
  })

  it('keeps the disguise for a wrong passphrase', () => {
    render(<EepMode />)
    enterPassphrase('The Binding Coil Turn 5')
    expect(useUiStore.getState().eepMode).toBe(true)
  })

  it('while locked, opens the PIN pad instead of the chat, even before the PIN length has loaded', () => {
    useUiStore.setState({ pinLocked: true, pinLength: null })
    render(<EepMode />)
    enterPassphrase(PASSPHRASE)
    expect(useUiStore.getState()).toMatchObject({ eepMode: true, pinLocked: true })
    expect(screen.queryByTestId('pin-dots')).toBeNull()

    act(() => useUiStore.setState({ pinLength: 6 }))
    expect(screen.getByTestId('pin-dots')).toBeInTheDocument()
    expect(useUiStore.getState().eepMode).toBe(true)
  })

  it('while locked with the PIN length known, still never opens the chat', () => {
    useUiStore.setState({ pinLocked: true, pinLength: 4 })
    render(<EepMode />)
    enterPassphrase(PASSPHRASE)
    expect(useUiStore.getState().eepMode).toBe(true)
    expect(screen.getByTestId('pin-dots')).toBeInTheDocument()
  })
})
