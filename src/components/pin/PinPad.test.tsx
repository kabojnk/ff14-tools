import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PinPad } from '@/components/pin/PinPad'

function tap(keys: string) {
  act(() => {
    for (const k of keys) fireEvent.pointerDown(screen.getByRole('button', { name: k }))
  })
}

const dots = () => screen.getByTestId('pin-dots')

const PINS = { 4: '1234', 5: '13579', 6: '567890' } as const

describe.each([4, 5, 6] as const)('PinPad unlock (length %i)', (length) => {
  const pin = PINS[length]

  it('shows one dot per digit', () => {
    render(<PinPad mode="unlock" length={length} verify={vi.fn()} onSuccess={vi.fn()} />)
    expect(dots().children).toHaveLength(length)
  })

  it('verifies once with every rapidly tapped digit', async () => {
    const verify = vi.fn().mockResolvedValue(true)
    const onSuccess = vi.fn()
    render(<PinPad mode="unlock" length={length} verify={verify} onSuccess={onSuccess} />)
    tap(pin)
    expect(verify).toHaveBeenCalledTimes(1)
    expect(verify).toHaveBeenCalledWith(pin)
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(pin))
  })

  it('ignores extra taps while verifying', () => {
    const verify = vi.fn(() => new Promise<boolean>(() => {}))
    render(<PinPad mode="unlock" length={length} verify={verify} onSuccess={vi.fn()} />)
    tap(pin + '1')
    expect(verify).toHaveBeenCalledTimes(1)
    expect(dots()).toHaveAttribute('data-filled', String(length))
  })

  it('shakes and clears on a wrong PIN, then accepts the right one', async () => {
    const verify = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    const onSuccess = vi.fn()
    render(<PinPad mode="unlock" length={length} verify={verify} onSuccess={onSuccess} />)
    tap('0'.repeat(length))
    await waitFor(() => expect(dots()).toHaveAttribute('data-state', 'error'))
    await waitFor(() => expect(dots()).toHaveAttribute('data-state', 'idle'))
    expect(dots()).toHaveAttribute('data-filled', '0')
    tap(pin)
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(pin))
  })
})

describe('PinPad unlock controls', () => {
  it('switches the bottom-right button between Cancel and Delete', () => {
    const onCancel = vi.fn()
    render(<PinPad mode="unlock" length={4} verify={vi.fn()} onSuccess={vi.fn()} onCancel={onCancel} />)
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    tap('1')
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Delete' }))
    expect(dots()).toHaveAttribute('data-filled', '0')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('hides Cancel when no onCancel is given', () => {
    render(<PinPad mode="unlock" length={4} verify={vi.fn()} onSuccess={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
  })

  it('reports a verification error, unlocks input, and clears the message on the next tap', async () => {
    const verify = vi.fn().mockRejectedValue(new Error('network'))
    render(<PinPad mode="unlock" length={4} verify={verify} onSuccess={vi.fn()} />)
    tap('1234')
    expect(await screen.findByText("Couldn't verify. Try again.")).toBeInTheDocument()
    await waitFor(() => expect(dots()).toHaveAttribute('data-state', 'idle'))
    tap('1')
    expect(dots()).toHaveAttribute('data-filled', '1')
    expect(screen.queryByText("Couldn't verify. Try again.")).not.toBeInTheDocument()
  })

  it('accepts digits, Backspace and Escape from a hardware keyboard', () => {
    const verify = vi.fn(() => new Promise<boolean>(() => {}))
    const onCancel = vi.fn()
    render(<PinPad mode="unlock" length={4} verify={verify} onSuccess={vi.fn()} onCancel={onCancel} />)
    fireEvent.keyDown(window, { key: '9' })
    fireEvent.keyDown(window, { key: 'Backspace' })
    expect(dots()).toHaveAttribute('data-filled', '0')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
    for (const k of '4321') fireEvent.keyDown(window, { key: k })
    expect(verify).toHaveBeenCalledWith('4321')
  })

  it('ignores Escape while a PIN is being verified', () => {
    const onCancel = vi.fn()
    render(
      <PinPad mode="unlock" length={4} verify={() => new Promise<boolean>(() => {})} onSuccess={vi.fn()} onCancel={onCancel} />,
    )
    tap('1234')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('never calls onSuccess if it is closed before verification finishes', async () => {
    let resolveVerify: (ok: boolean) => void = () => {}
    const verify = () => new Promise<boolean>((r) => { resolveVerify = r })
    const onSuccess = vi.fn()
    const { unmount } = render(<PinPad mode="unlock" length={4} verify={verify} onSuccess={onSuccess} />)
    tap('1234')
    unmount()
    await act(async () => resolveVerify(true))
    await new Promise((r) => setTimeout(r, 300))
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('comes back usable with a message if onSuccess fails (e.g. the PIN could not be saved)', async () => {
    const onSuccess = vi.fn().mockRejectedValue(new Error('permission denied'))
    render(<PinPad mode="unlock" length={4} verify={vi.fn().mockResolvedValue(true)} onSuccess={onSuccess} />)
    tap('1234')
    expect(await screen.findByText("Couldn't save. Try again.")).toBeInTheDocument()
    await waitFor(() => expect(dots()).toHaveAttribute('data-state', 'idle'))
    expect(screen.getByRole('dialog')).not.toHaveClass('pin-pad-exit')
    tap('1')
    expect(dots()).toHaveAttribute('data-filled', '1')
  })

  it('ignores keys typed into a text field', () => {
    const verify = vi.fn(() => new Promise<boolean>(() => {}))
    render(
      <>
        <input aria-label="other field" />
        <PinPad mode="unlock" length={4} verify={verify} onSuccess={vi.fn()} />
      </>,
    )
    const field = screen.getByRole('textbox', { name: 'other field' })
    for (const k of '1234') fireEvent.keyDown(field, { key: k })
    expect(dots()).toHaveAttribute('data-filled', '0')
    expect(verify).not.toHaveBeenCalled()
  })

  it('keeps the keys it handles from reaching other window listeners', () => {
    const onCancel = vi.fn()
    render(<PinPad mode="unlock" length={4} verify={vi.fn()} onSuccess={vi.fn()} onCancel={onCancel} />)
    const other = vi.fn()
    window.addEventListener('keydown', other)
    try {
      fireEvent.keyDown(window, { key: 'Escape' })
      fireEvent.keyDown(window, { key: '7' })
    } finally {
      window.removeEventListener('keydown', other)
    }
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(other).not.toHaveBeenCalled()
  })

  it('uses a custom title when given', () => {
    render(<PinPad mode="unlock" length={4} title="Enter Current Passcode" verify={vi.fn()} onSuccess={vi.fn()} />)
    expect(screen.getByText('Enter Current Passcode')).toBeInTheDocument()
  })
})

describe('PinPad set mode', () => {
  it('defaults to 6 digits and lets the user pick 4 via Passcode Options', () => {
    render(<PinPad mode="set" onSuccess={vi.fn()} />)
    expect(screen.getByText('Enter New Passcode')).toBeInTheDocument()
    expect(dots().children).toHaveLength(6)
    fireEvent.click(screen.getByRole('button', { name: 'Passcode Options' }))
    fireEvent.click(screen.getByRole('button', { name: '4-Digit Numeric Code' }))
    expect(dots().children).toHaveLength(4)
  })

  it('calls onSuccess when the confirmation matches', async () => {
    const onSuccess = vi.fn()
    render(<PinPad mode="set" onSuccess={onSuccess} />)
    tap('123456')
    expect(screen.getByText('Confirm New Passcode')).toBeInTheDocument()
    expect(dots()).toHaveAttribute('data-filled', '0')
    tap('123456')
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('123456'))
  })

  it('restarts with a message when the confirmation does not match', async () => {
    const onSuccess = vi.fn()
    render(<PinPad mode="set" onSuccess={onSuccess} />)
    tap('123456')
    tap('654321')
    expect(await screen.findByText('Passcodes did not match. Try again.')).toBeInTheDocument()
    expect(screen.getByText('Enter New Passcode')).toBeInTheDocument()
    await waitFor(() => expect(dots()).toHaveAttribute('data-state', 'idle'))
    expect(onSuccess).not.toHaveBeenCalled()
  })
})
