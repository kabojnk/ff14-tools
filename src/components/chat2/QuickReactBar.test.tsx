import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({ select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }),
  },
}))

import { QuickReactBar } from '@/components/chat2/QuickReactBar'
import { DEFAULT_RECENT, noteRecentEmoji } from '@/lib/recentEmoji'

describe('QuickReactBar', () => {
  it('offers the six recent emoji, most recent first', () => {
    noteRecentEmoji(':blob:')
    render(<QuickReactBar onPick={() => {}} onClose={() => {}} emoji={(n) => (n === 'blob' ? '/blob.png' : undefined)} />)
    const bar = screen.getByRole('toolbar', { name: 'Quick reactions' })
    const buttons = within(bar).getAllByRole('button', { name: /^React with / })
    expect(buttons).toHaveLength(6)
    expect(buttons[0]).toHaveAccessibleName('React with :blob:')
    expect(buttons[0].querySelector('img')).toHaveAttribute('src', '/blob.png')
    expect(buttons[1]).toHaveAccessibleName(`React with ${DEFAULT_RECENT[0]}`)
  })

  it('picks an emoji and closes', () => {
    const onPick = vi.fn()
    const onClose = vi.fn()
    render(<QuickReactBar onPick={onPick} onClose={onClose} emoji={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: 'React with 😂' }))
    expect(onPick).toHaveBeenCalledWith('😂')
    expect(onClose).toHaveBeenCalled()
  })

  it('"+" opens the full emoji picker, which picks too', () => {
    const onPick = vi.fn()
    render(<QuickReactBar onPick={onPick} onClose={() => {}} emoji={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: 'More emoji' }))
    expect(screen.getByPlaceholderText('Search emoji')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '🥰' }))
    expect(onPick).toHaveBeenCalledWith('🥰')
  })

  it('closes on Escape and on a press outside', () => {
    const onClose = vi.fn()
    render(
      <div>
        <p>outside</p>
        <QuickReactBar onPick={() => {}} onClose={onClose} emoji={() => undefined} />
      </div>,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.pointerDown(screen.getByText('outside'))
    expect(onClose).toHaveBeenCalledTimes(2)
    fireEvent.pointerDown(screen.getByRole('button', { name: 'React with 😂' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
