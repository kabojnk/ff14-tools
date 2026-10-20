import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ChatMenu } from '@/components/chat2/ChatMenu'

function setup() {
  const props = { onSearch: vi.fn(), onMedia: vi.fn(), onPins: vi.fn(), onDragTheLake: vi.fn() }
  render(<ChatMenu {...props} />)
  const trigger = screen.getByRole('button', { name: 'More' })
  return { props, trigger }
}

describe('ChatMenu', () => {
  it('opens a menu with the items in order, Drag the Lake set apart in red', () => {
    const { trigger } = setup()
    expect(screen.queryByRole('menu')).toBeNull()
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    const items = screen.getAllByRole('menuitem')
    expect(items.map((i) => i.textContent)).toEqual(['Search messages', 'Media, files & links', 'Pinned messages', 'Drag the Lake'])
    expect(screen.getByRole('separator')).toBeInTheDocument()
    expect(items[3].className).toMatch(/--danger/)
  })

  it('focuses the first item and moves with the arrow keys, wrapping', () => {
    const { trigger } = setup()
    fireEvent.click(trigger)
    const items = screen.getAllByRole('menuitem')
    expect(items[0]).toHaveFocus()
    const menu = screen.getByRole('menu')
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(items[1]).toHaveFocus()
    fireEvent.keyDown(menu, { key: 'ArrowUp' })
    fireEvent.keyDown(menu, { key: 'ArrowUp' })
    expect(items[3]).toHaveFocus()
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(items[0]).toHaveFocus()
    fireEvent.keyDown(menu, { key: 'End' })
    expect(items[3]).toHaveFocus()
    fireEvent.keyDown(menu, { key: 'Home' })
    expect(items[0]).toHaveFocus()
  })

  it('closes on Escape and gives focus back to the button', () => {
    const { trigger } = setup()
    fireEvent.click(trigger)
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(trigger).toHaveFocus()
  })

  it('closes on a click outside', () => {
    const { trigger } = setup()
    fireEvent.click(trigger)
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('runs the chosen item and closes', () => {
    const { trigger, props } = setup()
    for (const [name, fn] of [
      ['Search messages', props.onSearch],
      ['Media, files & links', props.onMedia],
      ['Pinned messages', props.onPins],
      ['Drag the Lake', props.onDragTheLake],
    ] as const) {
      fireEvent.click(trigger)
      fireEvent.click(screen.getByRole('menuitem', { name }))
      expect(fn).toHaveBeenCalledTimes(1)
      expect(screen.queryByRole('menu')).toBeNull()
    }
  })
})
