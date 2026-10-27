import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@supabase/supabase-js'

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn(), auth: { signOut: vi.fn() } },
}))

const { mockLogOut } = vi.hoisted(() => ({ mockLogOut: vi.fn() }))
vi.mock('@/lib/logout', () => ({ logOut: mockLogOut }))

import { EepMode } from '@/components/eep/EepMode'
import { useUiStore } from '@/stores/uiStore'
import { useAuthStore } from '@/stores/authStore'

const PASSPHRASE = 'open sesame'
const initialUi = useUiStore.getState()

/** The passphrase goes in Aetherdesk's search field. */
function enterPassphrase(value: string) {
  const search = screen.getByRole('searchbox', { name: 'Search recipes, items and raids' })
  fireEvent.change(search, { target: { value } })
  fireEvent.submit(search.closest('form')!)
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

/** Taps the PIN pad's keys. */
function tapPin(pin: string) {
  for (const d of pin) fireEvent.pointerDown(document.querySelector(`[data-pin-key="${d}"]`)!)
}

const pad = () => screen.queryByTestId('pin-dots')
const unlockDot = () => screen.getByRole('button', { name: 'Unlock' })

/**
 * The PIN pad's states (the part of the app that's been hardest to get right). The pad opens only from the Unlock
 * dot (or the passphrase while locked), Cancel always closes it, and leaving the app always closes it.
 */
describe('EepMode PIN pad states', () => {
  const verify = vi.fn<(pin: string) => Promise<boolean>>()
  beforeEach(() => {
    verify.mockReset().mockImplementation(async (pin) => pin === '1234')
    useUiStore.setState({ pinLength: 4, verifyPin: verify })
  })

  it('a locked launch shows the FF14 screen and the dot, not the pad', () => {
    useUiStore.setState({ pinLocked: true })
    render(<EepMode />)
    expect(pad()).toBeNull()
    expect(unlockDot()).toBeInTheDocument()
  })

  it('the dot opens the pad; Cancel closes it and a locked app stays locked', () => {
    useUiStore.setState({ pinLocked: true })
    render(<EepMode />)
    fireEvent.click(unlockDot())
    expect(pad()).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(pad()).toBeNull()
    expect(useUiStore.getState()).toMatchObject({ eepMode: true, pinLocked: true })
    // And it opens again.
    fireEvent.click(unlockDot())
    expect(pad()).toBeInTheDocument()
  })

  it('the right PIN opens the chat and clears the lock', async () => {
    useUiStore.setState({ pinLocked: true })
    render(<EepMode />)
    fireEvent.click(unlockDot())
    tapPin('1234')
    await waitFor(() => expect(useUiStore.getState().eepMode).toBe(false))
    expect(useUiStore.getState()).toMatchObject({ pinLocked: false, pinPadOpen: false })
    expect(verify).toHaveBeenCalledWith('1234')
  })

  it('a wrong PIN shakes and keeps the pad, and the right one then works', async () => {
    useUiStore.setState({ pinLocked: true })
    render(<EepMode />)
    fireEvent.click(unlockDot())
    tapPin('9999')
    await waitFor(() => expect(pad()).toHaveAttribute('data-state', 'error'))
    await waitFor(() => expect(pad()).toHaveAttribute('data-filled', '0'))
    expect(useUiStore.getState()).toMatchObject({ eepMode: true, pinLocked: true, pinPadOpen: true })
    tapPin('1234')
    await waitFor(() => expect(useUiStore.getState().eepMode).toBe(false))
  })

  it('a failed check says so and lets the person try again', async () => {
    verify.mockRejectedValueOnce(new Error('verify_pin timed out'))
    render(<EepMode />)
    fireEvent.click(unlockDot())
    tapPin('1234')
    await waitFor(() => expect(screen.getByText("Couldn't verify. Try again.")).toBeInTheDocument())
    await waitFor(() => expect(pad()).toHaveAttribute('data-filled', '0'))
    tapPin('1234')
    await waitFor(() => expect(useUiStore.getState().eepMode).toBe(false))
  })

  it('leaving the app with the pad open closes it, and coming back shows the FF14 screen', () => {
    useUiStore.setState({ pinLocked: true })
    render(<EepMode />)
    fireEvent.click(unlockDot())
    tapPin('12')
    act(() => useUiStore.getState().disguiseOnLeave())
    expect(pad()).toBeNull()
    expect(useUiStore.getState()).toMatchObject({ eepMode: true, pinLocked: true })
    // The next pad starts empty.
    fireEvent.click(unlockDot())
    expect(pad()).toHaveAttribute('data-filled', '0')
  })

  it('leaving while the PIN is being checked keeps the app locked, whatever the answer', async () => {
    let answer!: (ok: boolean) => void
    verify.mockImplementation(() => new Promise((resolve) => (answer = resolve)))
    useUiStore.setState({ pinLocked: true })
    render(<EepMode />)
    fireEvent.click(unlockDot())
    tapPin('1234')
    act(() => useUiStore.getState().disguiseOnLeave())
    await act(async () => answer(true))
    await new Promise((r) => setTimeout(r, 300))
    expect(useUiStore.getState()).toMatchObject({ eepMode: true, pinLocked: true, pinPadOpen: false })
    expect(pad()).toBeNull()
  })

  it('leaving just after a right PIN (during the success animation) keeps the app locked', async () => {
    useUiStore.setState({ pinLocked: true })
    render(<EepMode />)
    fireEvent.click(unlockDot())
    tapPin('1234')
    await waitFor(() => expect(pad()).toHaveAttribute('data-state', 'success'))
    act(() => useUiStore.getState().disguiseOnLeave())
    await new Promise((r) => setTimeout(r, 300))
    expect(useUiStore.getState()).toMatchObject({ eepMode: true, pinLocked: true })
  })

  it('unlocked (the Eep! button): the passphrase opens the chat and the dot still offers the PIN', async () => {
    render(<EepMode />)
    expect(pad()).toBeNull()
    fireEvent.click(unlockDot())
    expect(pad()).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    enterPassphrase(PASSPHRASE)
    expect(useUiStore.getState().eepMode).toBe(false)
  })

  it('no PIN: no dot and no pad', () => {
    useUiStore.setState({ pinLength: null })
    render(<EepMode />)
    expect(screen.queryByRole('button', { name: 'Unlock' })).toBeNull()
    act(() => useUiStore.getState().openPinPad())
    expect(pad()).toBeNull()
  })

  it('signed out: no pad, even if one was asked for', () => {
    useAuthStore.setState({ user: null })
    useUiStore.setState({ pinLocked: true, pinPadOpen: true })
    render(<EepMode />)
    expect(pad()).toBeNull()
  })
})

describe('EepMode Logout', () => {
  it('logs out through the shared logOut()', () => {
    mockLogOut.mockReset().mockResolvedValue(undefined)
    render(<EepMode />)
    fireEvent.click(screen.getByRole('button', { name: 'Logout' }))
    expect(mockLogOut).toHaveBeenCalledTimes(1)
  })
})
