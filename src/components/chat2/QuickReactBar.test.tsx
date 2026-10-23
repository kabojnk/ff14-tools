import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => {
  const channel = { on: () => channel, subscribe: () => channel }
  return {
    supabase: {
      from: () => ({ select: () => Promise.resolve({ data: [], error: null }) }),
      channel: () => channel,
      removeChannel: () => {},
    },
  }
})
vi.mock('@/lib/emoji/data', async (orig) => ({
  ...(await orig<typeof import('@/lib/emoji/data')>()),
  loadEmoji: () => Promise.resolve([{ emoji: '🥰', label: 'smiling face with hearts', tags: [], tab: 'smileys' }]),
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

  it('"More emoji" opens the full picker; a press and click on an emoji there picks it (not an outside press)', async () => {
    const onPick = vi.fn()
    const onClose = vi.fn()
    render(<QuickReactBar onPick={onPick} onClose={onClose} emoji={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: 'More emoji' }))
    await act(async () => {})
    const picker = screen.getByRole('dialog', { name: 'Emoji picker' })
    const heart = within(picker).getByRole('button', { name: 'smiling face with hearts' })
    fireEvent.pointerDown(heart)
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(heart)
    expect(onPick).toHaveBeenCalledWith('🥰')
    expect(onClose).toHaveBeenCalled()
  })

  it('while the full picker is open, Escape closes only the picker', async () => {
    const onClose = vi.fn()
    render(<QuickReactBar onPick={() => {}} onClose={onClose} emoji={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: 'More emoji' }))
    await act(async () => {})
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Emoji picker' })).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('toolbar', { name: 'Quick reactions' })).toBeInTheDocument()
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
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
