import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemePicker } from '@/components/user/ThemePicker'
import { useUiStore } from '@/stores/uiStore'
import { THEMES } from '@/lib/themes'

describe('ThemePicker', () => {
  it('shows a swatch card for each of the 11 themes, marking the current one', () => {
    useUiStore.setState({ theme: 'nord' })
    render(<ThemePicker />)
    const cards = screen.getAllByRole('button')
    expect(cards.map((c) => c.textContent)).toEqual(THEMES.map((t) => t.name))
    expect(screen.getByRole('button', { name: 'Nord' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Dracula' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('applies a theme on click', async () => {
    useUiStore.setState({ theme: 'dark' })
    render(<ThemePicker />)
    await userEvent.click(screen.getByRole('button', { name: 'Catppuccin Latte' }))
    expect(useUiStore.getState().theme).toBe('latte')
    expect(screen.getByRole('button', { name: 'Catppuccin Latte' })).toHaveAttribute('aria-pressed', 'true')
  })
})
