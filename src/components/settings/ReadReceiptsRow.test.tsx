import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockUpdate, mockUpdateEq } = vi.hoisted(() => ({ mockUpdate: vi.fn(), mockUpdateEq: vi.fn() }))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      update: (values: unknown) => {
        mockUpdate(values)
        return { eq: mockUpdateEq }
      },
    }),
  },
}))

vi.mock('@/stores/authStore', async () => {
  const { create } = await import('zustand')
  return { useAuthStore: create(() => ({ profile: null as unknown })) }
})

import { ReadReceiptsRow } from '@/components/settings/ReadReceiptsRow'
import { useAuthStore } from '@/stores/authStore'

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

beforeEach(() => {
  mockUpdate.mockReset()
  mockUpdateEq.mockReset().mockResolvedValue({ error: null })
  useAuthStore.setState({ profile: { id: 'me', read_receipts: true } } as never)
})

describe('ReadReceiptsRow', () => {
  it('shows the sub-line and reflects my profile', () => {
    render(<ReadReceiptsRow />)
    expect(screen.getByRole('switch', { name: 'Read receipts' })).toBeChecked()
    expect(screen.getByText('Off means neither of you sees ✓✓')).toBeInTheDocument()
  })

  it('turns off optimistically and writes my row', async () => {
    const user = userEvent.setup()
    const d = deferred<{ error: null }>()
    mockUpdateEq.mockReturnValue(d.promise)
    render(<ReadReceiptsRow />)
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
    render(<ReadReceiptsRow />)
    const toggle = screen.getByRole('switch', { name: 'Read receipts' })
    await user.click(toggle)
    await waitFor(() => expect(toggle).toBeChecked())
    expect((useAuthStore.getState().profile as { read_receipts: boolean }).read_receipts).toBe(true)
  })
})
