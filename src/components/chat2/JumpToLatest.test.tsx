import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { JumpToLatest } from '@/components/chat2/JumpToLatest'

describe('JumpToLatest', () => {
  it('is labelled, and calls back when tapped', () => {
    const onClick = vi.fn()
    render(<JumpToLatest count={0} onClick={onClick} />)
    const button = screen.getByRole('button', { name: 'Jump to latest' })
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(button.querySelector('[data-count]')).toBeNull()
  })

  it('shows and announces the number of unseen messages', () => {
    render(<JumpToLatest count={3} onClick={() => {}} />)
    const button = screen.getByRole('button', { name: 'Jump to latest, 3 new messages' })
    expect(button.querySelector('[data-count]')).toHaveTextContent('3')
  })

  it('says "1 new message" in the singular and caps the badge at 99+', () => {
    const { rerender } = render(<JumpToLatest count={1} onClick={() => {}} />)
    expect(screen.getByRole('button', { name: 'Jump to latest, 1 new message' })).toBeInTheDocument()
    rerender(<JumpToLatest count={150} onClick={() => {}} />)
    expect(screen.getByRole('button', { name: 'Jump to latest, 150 new messages' }).querySelector('[data-count]')).toHaveTextContent(
      '99+',
    )
  })
})
