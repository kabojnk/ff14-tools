import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Ticks } from '@/components/chat2/Ticks'

describe('Ticks', () => {
  it.each([
    ['sending', 'Sending'],
    ['sent', 'Sent'],
    ['read', 'Read'],
  ] as const)('%s is labelled "%s"', (state, label) => {
    const { container } = render(<Ticks state={state} />)
    expect(container.querySelector(`[data-tick="${state}"]`)).not.toBeNull()
    expect(screen.getByRole('img', { name: label })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
  })

  it('read uses the tick colour, sent does not', () => {
    const { container, rerender } = render(<Ticks state="read" />)
    expect(container.querySelector('[data-tick]')).toHaveClass('text-[color:var(--tick)]')
    rerender(<Ticks state="sent" />)
    expect(container.querySelector('[data-tick]')).not.toHaveClass('text-[color:var(--tick)]')
  })

  it('failed shows "Not sent" with a Retry button', () => {
    const onRetry = vi.fn()
    const { container } = render(<Ticks state="failed" onRetry={onRetry} />)
    expect(container.querySelector('[data-tick="failed"]')).not.toBeNull()
    expect(screen.getByRole('img', { name: 'Not sent' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
