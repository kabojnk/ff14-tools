import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StatusPill } from '@/components/chat2/StatusPill'

describe('StatusPill', () => {
  it('shows the label with a solid dot in the status colour', () => {
    const { container } = render(<StatusPill label="Raiding" color="#ff66aa" />)
    expect(screen.getByText('Raiding')).toHaveAttribute('data-status-label')
    const dot = container.querySelector('[data-pill-dot]') as HTMLElement
    expect(dot.style.backgroundColor).toBe('rgb(255, 102, 170)')
    expect(dot).toHaveAttribute('aria-hidden')
  })

  it('tints the pill from the colour, mixing the text towards the foreground', () => {
    const { container } = render(<StatusPill label="Raiding" color="#ff66aa" />)
    const pill = container.querySelector('[data-status-pill]') as HTMLElement
    const style = pill.getAttribute('style') ?? ''
    expect(style).toMatch(/background-color: color-mix\(in srgb, (#ff66aa|rgb\(255, 102, 170\)) 18%, transparent\)/)
    expect(style).toContain('color-mix(in srgb, #ff66aa 65%, var(--fg))')
    expect(pill.className).toMatch(/rounded-full/)
  })
})
