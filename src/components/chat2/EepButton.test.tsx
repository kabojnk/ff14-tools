import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))

import { EepButton } from '@/components/chat2/EepButton'
import { useUiStore } from '@/stores/uiStore'

beforeEach(() => {
  useUiStore.setState({ eepMode: false })
})

describe('EepButton', () => {
  it('shows the disguise at once, with no confirmation', () => {
    render(<EepButton wide={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Eep!' }))
    expect(useUiStore.getState().eepMode).toBe(true)
  })

  it('is an icon on phones', () => {
    render(<EepButton wide={false} />)
    const button = screen.getByRole('button', { name: 'Eep!' })
    expect(button).not.toHaveTextContent('Eep!')
    expect(button.querySelector('svg')).not.toBeNull()
  })

  it('is a labelled pill on desktop', () => {
    render(<EepButton wide />)
    const button = screen.getByRole('button', { name: 'Eep!' })
    expect(button).toHaveTextContent('Eep!')
    expect(button.className).toMatch(/rounded-full/)
  })
})
