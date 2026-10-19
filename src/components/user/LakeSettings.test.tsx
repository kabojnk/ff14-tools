import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockFill, mockRpc, mockUpdate, mockUpdateEq } = vi.hoisted(() => ({
  mockFill: vi.fn(),
  mockRpc: vi.fn(),
  mockUpdate: vi.fn(),
  mockUpdateEq: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: mockRpc,
    from: () => ({
      update: (values: unknown) => {
        mockUpdate(values)
        return { eq: mockUpdateEq }
      },
    }),
  },
}))

vi.mock('@/stores/conversationStore', () => ({
  useConversationStore: (select: (s: { fillTheLake: typeof mockFill }) => unknown) => select({ fillTheLake: mockFill }),
}))

vi.mock('@/stores/authStore', async () => {
  const { create } = await import('zustand')
  return { useAuthStore: create(() => ({ profile: null as unknown })) }
})

import { LakeSettings } from '@/components/user/LakeSettings'
import { useAuthStore } from '@/stores/authStore'

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

beforeEach(() => {
  mockFill.mockReset()
  mockRpc.mockReset()
  mockUpdate.mockReset()
  mockUpdateEq.mockReset().mockResolvedValue({ error: null })
  useAuthStore.setState({ profile: { id: 'me', read_receipts: true } } as never)
})

describe('LakeSettings: Fill the Lake', () => {
  it('fills with the typed password, shows working, then "Lake filled." and clears the field', async () => {
    const user = userEvent.setup()
    const d = deferred<'filled'>()
    mockFill.mockReturnValue(d.promise)
    render(<LakeSettings />)

    const field = screen.getByLabelText('Lake password')
    await user.type(field, 'babystar')
    await user.click(screen.getByRole('button', { name: 'Fill the Lake' }))

    expect(mockFill).toHaveBeenCalledWith('babystar')
    expect(screen.getByRole('button', { name: 'Filling…' })).toBeDisabled()
    d.resolve('filled')
    expect(await screen.findByText('Lake filled.')).toBeInTheDocument()
    expect(field).toHaveValue('')
  })

  it('Enter submits', async () => {
    const user = userEvent.setup()
    mockFill.mockResolvedValue('filled')
    render(<LakeSettings />)
    await user.type(screen.getByLabelText('Lake password'), 'babystar{Enter}')
    expect(mockFill).toHaveBeenCalledWith('babystar')
  })

  it('shows "Wrong password." and keeps the field', async () => {
    const user = userEvent.setup()
    mockFill.mockResolvedValue('wrong')
    render(<LakeSettings />)
    await user.type(screen.getByLabelText('Lake password'), 'nope')
    await user.click(screen.getByRole('button', { name: 'Fill the Lake' }))
    expect(await screen.findByText('Wrong password.')).toBeInTheDocument()
    expect(screen.getByLabelText('Lake password')).toHaveValue('nope')
  })

  it('shows "Couldn\'t fill the lake. Try again." on an error', async () => {
    const user = userEvent.setup()
    mockFill.mockResolvedValue('error')
    render(<LakeSettings />)
    await user.type(screen.getByLabelText('Lake password'), 'babystar')
    await user.click(screen.getByRole('button', { name: 'Fill the Lake' }))
    expect(await screen.findByText("Couldn't fill the lake. Try again.")).toBeInTheDocument()
  })

  it('does nothing with an empty password', async () => {
    const user = userEvent.setup()
    render(<LakeSettings />)
    expect(screen.getByRole('button', { name: 'Fill the Lake' })).toBeDisabled()
    await user.type(screen.getByLabelText('Lake password'), '{Enter}')
    expect(mockFill).not.toHaveBeenCalled()
  })
})

describe('LakeSettings: Change lake password', () => {
  it('is disabled while the new password is blank', async () => {
    const user = userEvent.setup()
    render(<LakeSettings />)
    const save = screen.getByRole('button', { name: 'Save' })
    expect(save).toBeDisabled()
    await user.type(screen.getByLabelText('Current lake password'), 'old')
    await user.type(screen.getByLabelText('New lake password'), '   ')
    expect(save).toBeDisabled()
  })

  it('calls set_lake_password and shows "Lake password changed."', async () => {
    const user = userEvent.setup()
    mockRpc.mockResolvedValue({ data: true, error: null })
    render(<LakeSettings />)
    await user.type(screen.getByLabelText('Current lake password'), 'old')
    await user.type(screen.getByLabelText('New lake password'), 'new')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(mockRpc).toHaveBeenCalledWith('set_lake_password', { p_current: 'old', p_new: 'new' })
    expect(await screen.findByText('Lake password changed.')).toBeInTheDocument()
    expect(screen.getByLabelText('Current lake password')).toHaveValue('')
    expect(screen.getByLabelText('New lake password')).toHaveValue('')
  })

  it('shows "Current password is wrong." when the RPC returns false', async () => {
    const user = userEvent.setup()
    mockRpc.mockResolvedValue({ data: false, error: null })
    render(<LakeSettings />)
    await user.type(screen.getByLabelText('Current lake password'), 'bad')
    await user.type(screen.getByLabelText('New lake password'), 'new')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Current password is wrong.')).toBeInTheDocument()
  })

  it('shows the error message when the RPC fails', async () => {
    const user = userEvent.setup()
    mockRpc.mockResolvedValue({ data: null, error: { message: 'the new lake password cannot be blank' } })
    render(<LakeSettings />)
    await user.type(screen.getByLabelText('Current lake password'), 'old')
    await user.type(screen.getByLabelText('New lake password'), 'x')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('the new lake password cannot be blank')).toBeInTheDocument()
  })
})

describe('LakeSettings: Read receipts', () => {
  it('shows the help text and reflects my profile', () => {
    render(<LakeSettings />)
    expect(screen.getByRole('switch', { name: 'Read receipts' })).toBeChecked()
    expect(
      screen.getByText("If you turn this off, you won't see when others have read your messages either."),
    ).toBeInTheDocument()
  })

  it('turns off optimistically and writes my row', async () => {
    const user = userEvent.setup()
    const d = deferred<{ error: null }>()
    mockUpdateEq.mockReturnValue(d.promise)
    render(<LakeSettings />)
    const toggle = screen.getByRole('switch', { name: 'Read receipts' })
    await user.click(toggle)
    expect(toggle).not.toBeChecked()
    expect(mockUpdate).toHaveBeenCalledWith({ read_receipts: false })
    expect(mockUpdateEq).toHaveBeenCalledWith('id', 'me')
    d.resolve({ error: null })
    await waitFor(() => expect((useAuthStore.getState().profile as { read_receipts: boolean }).read_receipts).toBe(false))
    expect(toggle).not.toBeChecked()
  })

  it('reverts when the write fails', async () => {
    const user = userEvent.setup()
    mockUpdateEq.mockResolvedValue({ error: { message: 'offline' } })
    render(<LakeSettings />)
    const toggle = screen.getByRole('switch', { name: 'Read receipts' })
    await user.click(toggle)
    await waitFor(() => expect(toggle).toBeChecked())
    expect((useAuthStore.getState().profile as { read_receipts: boolean }).read_receipts).toBe(true)
  })
})
