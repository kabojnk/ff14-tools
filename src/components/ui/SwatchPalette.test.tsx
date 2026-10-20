import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SwatchPalette } from './SwatchPalette'
import { STATUS_SWATCHES } from '@/lib/swatches'

const customCircle = () => screen.getByLabelText('Custom colour').closest('[data-swatch-custom]')

describe('SwatchPalette', () => {
  it('is a radiogroup named "Colour" with one radio per preset', () => {
    render(<SwatchPalette value="#ef4444" onChange={() => {}} />)
    const group = screen.getByRole('radiogroup', { name: 'Colour' })
    expect(group).toBeInTheDocument()
    const radios = screen.getAllByRole('radio')
    expect(radios.map((r) => r.getAttribute('aria-label'))).toEqual([...STATUS_SWATCHES])
    expect(screen.getByLabelText('Custom colour')).toHaveAttribute('type', 'color')
  })

  it('marks the selected preset, case-insensitively', () => {
    render(<SwatchPalette value="#14B8A6" onChange={() => {}} />)
    expect(screen.getByRole('radio', { name: '#14b8a6' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: '#ef4444' })).toHaveAttribute('aria-checked', 'false')
    expect(customCircle()).toHaveAttribute('data-selected', 'false')
  })

  it('calls onChange with the picked swatch', async () => {
    const onChange = vi.fn()
    render(<SwatchPalette value="#ef4444" onChange={onChange} />)
    await userEvent.click(screen.getByRole('radio', { name: '#a855f7' }))
    expect(onChange).toHaveBeenCalledWith('#a855f7')
  })

  it('marks the custom circle selected for a colour that is not a preset', () => {
    render(<SwatchPalette value="#123456" onChange={() => {}} />)
    expect(screen.getAllByRole('radio').every((r) => r.getAttribute('aria-checked') === 'false')).toBe(true)
    expect(customCircle()).toHaveAttribute('data-selected', 'true')
    expect(screen.getByLabelText('Custom colour')).toHaveValue('#123456')
  })

  it('reports a custom colour', () => {
    const onChange = vi.fn()
    render(<SwatchPalette value="#ef4444" onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Custom colour'), { target: { value: '#abcdef' } })
    expect(onChange).toHaveBeenCalledWith('#abcdef')
  })

  it('moves between swatches with the arrow keys and selects on the way', async () => {
    const onChange = vi.fn()
    render(<SwatchPalette value="#ef4444" onChange={onChange} />)
    const first = screen.getByRole('radio', { name: '#ef4444' })
    expect(first).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('radio', { name: '#f97316' })).toHaveAttribute('tabindex', '-1')
    first.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('radio', { name: '#f97316' })).toHaveFocus()
    expect(onChange).toHaveBeenLastCalledWith('#f97316')
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(screen.getByRole('radio', { name: '#94a3b8' })).toHaveFocus()
  })
})
