import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockFill, mockRpc } = vi.hoisted(() => ({ mockFill: vi.fn(), mockRpc: vi.fn() }))

vi.mock('@/lib/supabase', () => ({ supabase: { rpc: mockRpc } }))

vi.mock('@/stores/conversationStore', () => ({
  useConversationStore: (select: (s: { fillTheLake: typeof mockFill }) => unknown) => select({ fillTheLake: mockFill }),
}))

import { LakeRows } from '@/components/settings/LakeRows'

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

/** Expands a row and returns its region. */
async function expand(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole('button', { name, expanded: false }))
  return screen.getByRole('region', { name })
}

beforeEach(() => {
  mockFill.mockReset()
  mockRpc.mockReset()
})

describe('LakeRows: disclosure', () => {
  it('shows two collapsed rows that expand a region of the same name', async () => {
    const user = userEvent.setup()
    render(<LakeRows />)
    const fill = screen.getByRole('button', { name: 'Fill the Lake' })
    const change = screen.getByRole('button', { name: 'Change lake password' })
    expect(fill).toHaveAttribute('aria-expanded', 'false')
    expect(change).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('region')).toBeNull()

    await user.click(fill)
    expect(fill).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('region', { name: 'Fill the Lake' })).toBeInTheDocument()

    await user.click(fill)
    expect(fill).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('region', { name: 'Fill the Lake' })).toBeNull()
  })
})

describe('LakeRows: Fill the Lake', () => {
  it('fills with the typed password, shows working, then "Lake filled." and clears the field, staying open', async () => {
    const user = userEvent.setup()
    const d = deferred<'filled'>()
    mockFill.mockReturnValue(d.promise)
    render(<LakeRows />)
    const region = await expand(user, 'Fill the Lake')

    const field = within(region).getByLabelText('Lake password')
    await user.type(field, 'babystar')
    await user.click(within(region).getByRole('button', { name: 'Fill the Lake' }))

    expect(mockFill).toHaveBeenCalledWith('babystar')
    expect(within(region).getByRole('button', { name: 'Filling…' })).toBeDisabled()
    d.resolve('filled')
    expect(await within(region).findByText('Lake filled.')).toBeInTheDocument()
    expect(field).toHaveValue('')
    expect(screen.getByRole('region', { name: 'Fill the Lake' })).toBeInTheDocument()
  })

  it('Enter submits', async () => {
    const user = userEvent.setup()
    mockFill.mockResolvedValue('filled')
    render(<LakeRows />)
    const region = await expand(user, 'Fill the Lake')
    await user.type(within(region).getByLabelText('Lake password'), 'babystar{Enter}')
    expect(mockFill).toHaveBeenCalledWith('babystar')
  })

  it('shows "Wrong password." and keeps the field', async () => {
    const user = userEvent.setup()
    mockFill.mockResolvedValue('wrong')
    render(<LakeRows />)
    const region = await expand(user, 'Fill the Lake')
    await user.type(within(region).getByLabelText('Lake password'), 'nope')
    await user.click(within(region).getByRole('button', { name: 'Fill the Lake' }))
    expect(await screen.findByText('Wrong password.')).toBeInTheDocument()
    expect(within(region).getByLabelText('Lake password')).toHaveValue('nope')
  })

  it('shows "Couldn\'t fill the lake. Try again." on an error', async () => {
    const user = userEvent.setup()
    mockFill.mockResolvedValue('error')
    render(<LakeRows />)
    const region = await expand(user, 'Fill the Lake')
    await user.type(within(region).getByLabelText('Lake password'), 'babystar')
    await user.click(within(region).getByRole('button', { name: 'Fill the Lake' }))
    expect(await screen.findByText("Couldn't fill the lake. Try again.")).toBeInTheDocument()
  })

  it('does nothing with an empty password', async () => {
    const user = userEvent.setup()
    render(<LakeRows />)
    const region = await expand(user, 'Fill the Lake')
    expect(within(region).getByRole('button', { name: 'Fill the Lake' })).toBeDisabled()
    await user.type(within(region).getByLabelText('Lake password'), '{Enter}')
    expect(mockFill).not.toHaveBeenCalled()
  })
})

describe('LakeRows: Change lake password', () => {
  it('is disabled while the new password is blank', async () => {
    const user = userEvent.setup()
    render(<LakeRows />)
    const region = await expand(user, 'Change lake password')
    const save = within(region).getByRole('button', { name: 'Save' })
    expect(save).toBeDisabled()
    await user.type(within(region).getByLabelText('Current lake password'), 'old')
    await user.type(within(region).getByLabelText('New lake password'), '   ')
    expect(save).toBeDisabled()
  })

  it('calls set_lake_password and shows "Lake password changed.", staying open', async () => {
    const user = userEvent.setup()
    mockRpc.mockResolvedValue({ data: true, error: null })
    render(<LakeRows />)
    const region = await expand(user, 'Change lake password')
    await user.type(within(region).getByLabelText('Current lake password'), 'old')
    await user.type(within(region).getByLabelText('New lake password'), 'new')
    await user.click(within(region).getByRole('button', { name: 'Save' }))
    expect(mockRpc).toHaveBeenCalledWith('set_lake_password', { p_current: 'old', p_new: 'new' })
    expect(await within(region).findByText('Lake password changed.')).toBeInTheDocument()
    expect(within(region).getByLabelText('Current lake password')).toHaveValue('')
    expect(within(region).getByLabelText('New lake password')).toHaveValue('')
  })

  it('shows "Current password is wrong." when the RPC returns false', async () => {
    const user = userEvent.setup()
    mockRpc.mockResolvedValue({ data: false, error: null })
    render(<LakeRows />)
    const region = await expand(user, 'Change lake password')
    await user.type(within(region).getByLabelText('Current lake password'), 'bad')
    await user.type(within(region).getByLabelText('New lake password'), 'new')
    await user.click(within(region).getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Current password is wrong.')).toBeInTheDocument()
  })

  it('shows the error message when the RPC fails', async () => {
    const user = userEvent.setup()
    mockRpc.mockResolvedValue({ data: null, error: { message: 'the new lake password cannot be blank' } })
    render(<LakeRows />)
    const region = await expand(user, 'Change lake password')
    await user.type(within(region).getByLabelText('Current lake password'), 'old')
    await user.type(within(region).getByLabelText('New lake password'), 'x')
    await user.click(within(region).getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('the new lake password cannot be blank')).toBeInTheDocument()
  })
})
