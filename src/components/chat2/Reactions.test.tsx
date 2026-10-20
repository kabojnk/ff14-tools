import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({ select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }),
  },
}))

import { Reactions, type ReactionsProps } from '@/components/chat2/Reactions'

// jsdom has no PointerEvent, so fireEvent would drop pointerType.
if (typeof window.PointerEvent === 'undefined') {
  class PointerEventShim extends MouseEvent {
    pointerType: string
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init)
      this.pointerType = init.pointerType ?? ''
    }
  }
  window.PointerEvent = PointerEventShim as unknown as typeof PointerEvent
}

const chips = [
  { emoji: '❤️', count: 2, mine: true, userIds: ['bea', 'alice'], fresh: false },
  { emoji: ':blob:', count: 1, mine: false, userIds: ['bea'], fresh: true },
]

function setup(over: Partial<ReactionsProps> = {}) {
  const props: ReactionsProps = {
    chips,
    side: 'them',
    isDesktop: false,
    emoji: (n) => (n === 'blob' ? '/blob.png' : undefined),
    whoReacted: (ids) => ids.map((id) => (id === 'alice' ? 'You' : 'Bea')).join(', '),
    onToggle: vi.fn(),
    ...over,
  }
  const utils = render(<Reactions {...props} />)
  return { ...utils, props }
}

afterEach(() => vi.useRealTimers())

describe('Reactions', () => {
  it('renders nothing without reactions', () => {
    const { container } = setup({ chips: [] })
    expect(container).toBeEmptyDOMElement()
  })

  it('shows a chip per emoji with its count; mine is pressed', () => {
    setup()
    const heart = screen.getByRole('button', { name: '❤️ 2' })
    expect(heart).toHaveAttribute('aria-pressed', 'true')
    const blob = screen.getByRole('button', { name: ':blob: 1' })
    expect(blob).toHaveAttribute('aria-pressed', 'false')
    expect(blob.querySelector('img')).toHaveAttribute('src', '/blob.png')
  })

  it('tapping a chip toggles that emoji', () => {
    const { props } = setup()
    fireEvent.click(screen.getByRole('button', { name: '❤️ 2' }))
    expect(props.onToggle).toHaveBeenCalledWith('❤️')
  })

  it('pops in only the chips that arrived live', () => {
    setup()
    expect(screen.getByRole('button', { name: '❤️ 2' })).not.toHaveClass('rx-pop')
    expect(screen.getByRole('button', { name: ':blob: 1' })).toHaveClass('rx-pop')
  })

  it('sits on the bubble side', () => {
    const { container } = setup({ side: 'me' })
    expect(container.querySelector('[data-reactions]')).toHaveClass('justify-end')
  })

  it('a long-press shows who reacted, without toggling', () => {
    vi.useFakeTimers()
    const { props } = setup()
    const heart = screen.getByRole('button', { name: '❤️ 2' })
    fireEvent.pointerDown(heart, { pointerType: 'touch' })
    act(() => vi.advanceTimersByTime(600))
    expect(screen.getByRole('tooltip')).toHaveTextContent('Bea, You')
    fireEvent.pointerUp(heart, { pointerType: 'touch' })
    fireEvent.click(heart)
    expect(props.onToggle).not.toHaveBeenCalled()
  })

  it('hovering a chip with a mouse shows who reacted', () => {
    setup({ isDesktop: true })
    const blob = screen.getByRole('button', { name: ':blob: 1' })
    fireEvent.pointerEnter(blob, { pointerType: 'mouse' })
    expect(screen.getByRole('tooltip')).toHaveTextContent('Bea')
    fireEvent.pointerLeave(blob, { pointerType: 'mouse' })
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('the add chip opens the quick bar, and a pick toggles', () => {
    const { props } = setup()
    const add = screen.getByRole('button', { name: 'Add reaction' })
    expect(add).not.toHaveClass('opacity-0') // always shown on phones
    fireEvent.click(add)
    fireEvent.click(screen.getByRole('button', { name: 'React with 😂' }))
    expect(props.onToggle).toHaveBeenCalledWith('😂')
    expect(screen.queryByRole('toolbar')).toBeNull()
  })

  it('on desktop the add chip waits for the row hover', () => {
    setup({ isDesktop: true })
    expect(screen.getByRole('button', { name: 'Add reaction' })).toHaveClass('opacity-0')
  })
})
