import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeGrid } from '@/components/settings/ThemeGrid'
import { useUiStore } from '@/stores/uiStore'
import { THEMES } from '@/lib/themes'

describe('ThemeGrid', () => {
  it('shows a card for each of the 11 themes in a "Theme" radiogroup, marking the current one', () => {
    useUiStore.setState({ theme: 'nord' })
    render(<ThemeGrid />)
    const group = screen.getByRole('radiogroup', { name: 'Theme' })
    const cards = within(group).getAllByRole('radio')
    expect(cards.map((c) => c.getAttribute('aria-label'))).toEqual(THEMES.map((t) => t.name))
    expect(screen.getByRole('radio', { name: 'Nord' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Dracula' })).not.toBeChecked()
  })

  it('applies a theme on click', async () => {
    useUiStore.setState({ theme: 'dark' })
    render(<ThemeGrid />)
    await userEvent.click(screen.getByRole('radio', { name: 'Catppuccin Latte' }))
    expect(useUiStore.getState().theme).toBe('latte')
    expect(screen.getByRole('radio', { name: 'Catppuccin Latte' })).toBeChecked()
  })

  it('shows each kind and previews each card in its own theme tokens', () => {
    useUiStore.setState({ theme: 'dark' })
    const { container } = render(<ThemeGrid />)
    const sakura = container.querySelector('[data-theme-card="sakura"]') as HTMLElement
    expect(sakura).toHaveTextContent('Pink · Light')
    expect(sakura.querySelector('[data-theme="sakura"]')).not.toBeNull()
    expect(container.querySelector('[data-theme-card="nord"]')).toHaveTextContent('Dark')
    expect(container.querySelector('[data-theme-card="latte"]')).toHaveTextContent('Light')
  })
})
