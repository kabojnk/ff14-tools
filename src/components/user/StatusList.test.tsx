import { createRef } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))

import { StatusList, type StatusListHandle } from './StatusList'
import { useStatusStore } from '@/stores/statusStore'
import type { StatusDefinition } from '@/types'

const def = (id: string, label: string, color: string, position: number): StatusDefinition =>
  ({ id, label, color, position, created_at: `2026-10-0${position + 1}T00:00:00Z` }) as StatusDefinition

const EEP = def('s1', 'Potential Eep', '#14b8a6', 0)
const FOUND = def('s2', 'Found Out', '#a855f7', 1)

const create = vi.fn()
const update = vi.fn()
const remove = vi.fn()

beforeEach(() => {
  create.mockReset().mockImplementation(async (input: { label: string; color: string }) => {
    const definition = def('new', input.label.trim(), input.color, 2)
    useStatusStore.setState((s) => ({ definitions: [...s.definitions, definition] }))
    return { error: null, definition }
  })
  update.mockReset().mockResolvedValue({ error: null })
  remove.mockReset().mockResolvedValue({ error: null })
  useStatusStore.setState({ definitions: [EEP, FOUND], create, update, remove } as never)
})

describe('StatusList', () => {
  it('shows the heading note, None, each status as a radio row and "New status"', () => {
    render(<StatusList selectedId="s1" onSelect={() => {}} />)
    expect(screen.getByText('Changes to the status list save straight away')).toBeInTheDocument()
    const group = screen.getByRole('radiogroup', { name: 'Custom status' })
    expect(group).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'None' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('radio', { name: 'Potential Eep' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Found Out' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByTitle('Edit Potential Eep')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /New status/ })).toBeInTheDocument()
  })

  it('selecting a row or None calls onSelect', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<StatusList selectedId="s1" onSelect={onSelect} />)
    await user.click(screen.getByRole('radio', { name: 'Found Out' }))
    expect(onSelect).toHaveBeenLastCalledWith('s2')
    await user.click(screen.getByRole('radio', { name: 'None' }))
    expect(onSelect).toHaveBeenLastCalledWith(null)
  })

  it('a selected status deleted elsewhere falls back to None', () => {
    render(<StatusList selectedId="gone" onSelect={() => {}} />)
    expect(screen.getByRole('radio', { name: 'None' })).toHaveAttribute('aria-checked', 'true')
  })

  it('creating with a swatch calls create({label, color}) and selects the new status', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<StatusList selectedId={null} onSelect={onSelect} />)
    await user.click(screen.getByRole('button', { name: /New status/ }))
    await user.type(screen.getByLabelText('Status label'), 'Under Close Watch')
    await user.click(screen.getByRole('radio', { name: '#3b82f6' }))
    await user.click(screen.getByRole('button', { name: 'Save status' }))
    expect(create).toHaveBeenCalledWith({ label: 'Under Close Watch', color: '#3b82f6' })
    expect(onSelect).toHaveBeenCalledWith('new')
    expect(screen.queryByLabelText('Status label')).not.toBeInTheDocument()
  })

  it('editing updates the label and colour; Enter saves', async () => {
    const user = userEvent.setup()
    render(<StatusList selectedId={null} onSelect={() => {}} />)
    await user.click(screen.getByTitle('Edit Found Out'))
    const input = screen.getByLabelText('Status label')
    expect(input).toHaveValue('Found Out')
    await user.click(screen.getByRole('radio', { name: '#ef4444' }))
    await user.clear(input)
    await user.type(input, 'Found Out!{Enter}')
    expect(update).toHaveBeenCalledWith('s2', { label: 'Found Out!', color: '#ef4444' })
    await waitFor(() => expect(screen.queryByLabelText('Status label')).not.toBeInTheDocument())
  })

  it('shows validation errors from validateStatus under the row and writes nothing', async () => {
    const user = userEvent.setup()
    render(<StatusList selectedId={null} onSelect={() => {}} />)
    await user.click(screen.getByTitle('Edit Found Out'))
    await user.clear(screen.getByLabelText('Status label'))
    await user.click(screen.getByRole('button', { name: 'Save status' }))
    expect(screen.getByRole('alert')).toHaveTextContent('The label must be 1–40 characters.')
    expect(update).not.toHaveBeenCalled()
  })

  it('shows a server error from the store under the row', async () => {
    update.mockResolvedValueOnce({ error: 'permission denied' })
    const user = userEvent.setup()
    render(<StatusList selectedId={null} onSelect={() => {}} />)
    await user.click(screen.getByTitle('Edit Found Out'))
    await user.click(screen.getByRole('button', { name: 'Save status' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('permission denied')
    expect(screen.getByLabelText('Status label')).toBeInTheDocument()
  })

  it('Escape cancels the edit and marks the event handled so the sheet stays open', async () => {
    const user = userEvent.setup()
    const outer = vi.fn()
    document.addEventListener('keydown', outer)
    render(<StatusList selectedId={null} onSelect={() => {}} />)
    await user.click(screen.getByTitle('Edit Found Out'))
    fireEvent.keyDown(screen.getByLabelText('Status label'), { key: 'Escape' })
    expect(screen.queryByLabelText('Status label')).not.toBeInTheDocument()
    expect(outer).toHaveBeenCalled()
    expect((outer.mock.calls[0][0] as KeyboardEvent).defaultPrevented).toBe(true)
    document.removeEventListener('keydown', outer)
    expect(update).not.toHaveBeenCalled()
  })

  it('deleting needs the in-row confirm step', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm')
    render(<StatusList selectedId={null} onSelect={() => {}} />)
    await user.click(screen.getByTitle('Edit Found Out'))
    await user.click(screen.getByTitle('Delete Found Out'))
    expect(remove).not.toHaveBeenCalled()
    expect(screen.getByText('Delete for everyone?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Keep' }))
    expect(screen.queryByText('Delete for everyone?')).not.toBeInTheDocument()
    expect(remove).not.toHaveBeenCalled()

    await user.click(screen.getByTitle('Delete Found Out'))
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(remove).toHaveBeenCalledWith('s2')
    expect(confirm).not.toHaveBeenCalled()
  })

  it('closes an open edit when its status is deleted elsewhere', async () => {
    const user = userEvent.setup()
    render(<StatusList selectedId={null} onSelect={() => {}} />)
    await user.click(screen.getByTitle('Edit Found Out'))
    act(() => useStatusStore.setState({ definitions: [EEP] }))
    expect(screen.queryByLabelText('Status label')).not.toBeInTheDocument()
  })

  describe('commit() (the editor saves an open edit first)', () => {
    it('is true with no edit open', async () => {
      const ref = createRef<StatusListHandle>()
      render(<StatusList ref={ref} selectedId={null} onSelect={() => {}} />)
      expect(ref.current?.hasOpenEdit()).toBe(false)
      await expect(ref.current!.commit()).resolves.toBe(true)
    })

    it('saves a valid open edit and is true', async () => {
      const user = userEvent.setup()
      const ref = createRef<StatusListHandle>()
      const onSelect = vi.fn()
      render(<StatusList ref={ref} selectedId={null} onSelect={onSelect} />)
      await user.click(screen.getByRole('button', { name: /New status/ }))
      await user.type(screen.getByLabelText('Status label'), 'Busy')
      expect(ref.current?.hasOpenEdit()).toBe(true)
      let ok = false
      await act(async () => {
        ok = await ref.current!.commit()
      })
      expect(ok).toBe(true)
      expect(create).toHaveBeenCalledWith({ label: 'Busy', color: '#ef4444' })
      expect(onSelect).toHaveBeenCalledWith('new')
    })

    it('is false and shows the error for an invalid open edit', async () => {
      const user = userEvent.setup()
      const ref = createRef<StatusListHandle>()
      render(<StatusList ref={ref} selectedId={null} onSelect={() => {}} />)
      await user.click(screen.getByRole('button', { name: /New status/ }))
      let ok = true
      await act(async () => {
        ok = await ref.current!.commit()
      })
      expect(ok).toBe(false)
      expect(screen.getByRole('alert')).toHaveTextContent('The label must be 1–40 characters.')
      expect(create).not.toHaveBeenCalled()
    })
  })
})
