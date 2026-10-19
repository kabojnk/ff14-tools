import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MediaFilters, type MediaFiltersProps } from '@/components/chat/MediaFilters'

function setup(over: Partial<MediaFiltersProps> = {}) {
  const props: MediaFiltersProps = {
    kind: 'all',
    onKindChange: vi.fn(),
    extension: '',
    onExtensionChange: vi.fn(),
    scope: 'space',
    onScopeChange: vi.fn(),
    ...over,
  }
  render(<MediaFilters {...props} />)
  return props
}

describe('MediaFilters', () => {
  it('shows every type chip and marks the current one', () => {
    setup({ kind: 'files' })
    for (const name of ['All', 'Photos', 'Videos', 'GIFs', 'Files', 'Links', 'Voice']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: 'Files' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('picks a type', async () => {
    const props = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Links' }))
    expect(props.onKindChange).toHaveBeenCalledWith('links')
  })

  it('reports typing in the extension box', async () => {
    const props = setup()
    await userEvent.type(screen.getByPlaceholderText('Extension (e.g. zip)'), 'z')
    expect(props.onExtensionChange).toHaveBeenCalledWith('z')
  })

  it('clears the extension with ×, shown only when there is one', async () => {
    setup()
    expect(screen.queryByRole('button', { name: 'Clear extension' })).toBeNull()
    const props = setup({ extension: 'zip' })
    await userEvent.click(screen.getByRole('button', { name: 'Clear extension' }))
    expect(props.onExtensionChange).toHaveBeenCalledWith('')
  })

  it('toggles between this space and both', async () => {
    const props = setup()
    expect(screen.getByRole('button', { name: 'This space' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Both' }))
    expect(props.onScopeChange).toHaveBeenCalledWith('both')
  })
})
