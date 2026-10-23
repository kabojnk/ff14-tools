import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn(), auth: { signOut: vi.fn() } },
}))

// A stand-in PinPad: "Enter" submits a fixed PIN, "Cancel PIN" cancels.
vi.mock('@/components/pin/PinPad', () => ({
  PinPad: ({ mode, title, onSuccess, onCancel }: {
    mode: string
    title?: string
    onSuccess: (pin: string) => void | Promise<void>
    onCancel?: () => void
  }) => (
    <div data-pin-pad="" data-testid="pin-pad" data-mode={mode}>
      {title && <p>{title}</p>}
      <button type="button" onClick={() => void onSuccess('123456')}>Enter</button>
      <button type="button" onClick={onCancel}>Cancel PIN</button>
    </div>
  ),
}))

import { SecuritySection } from '@/components/settings/SecuritySection'
import { useAuthStore } from '@/stores/authStore'
import { useUiStore } from '@/stores/uiStore'

const setPin = vi.fn()
const clearPinRemote = vi.fn()
const verifyPin = vi.fn()

beforeEach(() => {
  setPin.mockReset().mockImplementation(async (pin: string) => {
    useUiStore.setState({ pinLength: pin.length })
  })
  clearPinRemote.mockReset().mockImplementation(async () => {
    useUiStore.setState({ pinLength: null })
  })
  verifyPin.mockReset().mockResolvedValue(true)
  useUiStore.setState({ pinLength: null, setPin, clearPinRemote, verifyPin })
  useAuthStore.setState({ profile: { id: 'me', read_receipts: true } } as never)
})

describe('SecuritySection: PIN rows', () => {
  it('with no PIN: "App Lock PIN" group, "Lock PIN" Off and only "Set PIN"', () => {
    render(<SecuritySection />)
    expect(screen.getByText('App Lock PIN')).toBeInTheDocument()
    expect(screen.getByText('Off')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Set PIN' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Change PIN' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Remove PIN' })).toBeNull()
  })

  it('with a 6-digit PIN: "6 digits", "Change PIN" and "Remove PIN"', () => {
    useUiStore.setState({ pinLength: 6 })
    render(<SecuritySection />)
    expect(screen.getByText('6 digits')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Change PIN' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove PIN' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Set PIN' })).toBeNull()
  })

  it('Set PIN runs the wizard and shows "PIN set successfully"', async () => {
    const user = userEvent.setup()
    render(<SecuritySection />)
    await user.click(screen.getByRole('button', { name: 'Set PIN' }))
    expect(screen.getByTestId('pin-pad')).toHaveAttribute('data-mode', 'set')
    await user.click(screen.getByRole('button', { name: 'Enter' }))
    expect(setPin).toHaveBeenCalledWith('123456')
    expect(await screen.findByText('PIN set successfully')).toBeInTheDocument()
    expect(screen.queryByTestId('pin-pad')).toBeNull()
  })

  it('Change PIN verifies the current passcode, then sets, and the success message survives', async () => {
    const user = userEvent.setup()
    useUiStore.setState({ pinLength: 6 })
    render(<SecuritySection />)
    await user.click(screen.getByRole('button', { name: 'Change PIN' }))
    expect(screen.getByText('Enter Current Passcode')).toBeInTheDocument()
    expect(screen.getByTestId('pin-pad')).toHaveAttribute('data-mode', 'unlock')
    await user.click(screen.getByRole('button', { name: 'Enter' }))
    await waitFor(() => expect(screen.getByTestId('pin-pad')).toHaveAttribute('data-mode', 'set'))
    await user.click(screen.getByRole('button', { name: 'Enter' }))
    expect(setPin).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('PIN changed successfully')).toBeInTheDocument()
    // The pinLength change re-renders the rows; the message stays inside the section.
    expect(screen.getByRole('button', { name: 'Change PIN' })).toBeInTheDocument()
    expect(screen.getByText('PIN changed successfully')).toBeInTheDocument()
  })

  it('Remove PIN verifies, then clears it', async () => {
    const user = userEvent.setup()
    useUiStore.setState({ pinLength: 6 })
    render(<SecuritySection />)
    await user.click(screen.getByRole('button', { name: 'Remove PIN' }))
    await user.click(screen.getByRole('button', { name: 'Enter' }))
    expect(clearPinRemote).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('PIN removed')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Set PIN' })).toBeInTheDocument()
  })

  it('cancelling the PinPad saves nothing', async () => {
    const user = userEvent.setup()
    render(<SecuritySection />)
    await user.click(screen.getByRole('button', { name: 'Set PIN' }))
    await user.click(screen.getByRole('button', { name: 'Cancel PIN' }))
    expect(screen.queryByTestId('pin-pad')).toBeNull()
    expect(setPin).not.toHaveBeenCalled()
  })
})

describe('SecuritySection: other groups', () => {
  it('shows read receipts and the two lake rows', () => {
    render(<SecuritySection />)
    expect(screen.getByRole('switch', { name: 'Read receipts' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fill the Lake', expanded: false })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Change lake password', expanded: false })).toBeInTheDocument()
  })

  it('shows "Log out" only when given onLogOut, and calls it', async () => {
    const onLogOut = vi.fn()
    const { rerender } = render(<SecuritySection />)
    expect(screen.queryByRole('button', { name: 'Log out' })).toBeNull()
    rerender(<SecuritySection onLogOut={onLogOut} />)
    await userEvent.click(screen.getByRole('button', { name: 'Log out' }))
    expect(onLogOut).toHaveBeenCalledTimes(1)
  })
})
