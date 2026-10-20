import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LONG_PRESS_MS, useLongPress } from '@/hooks/useLongPress'

type Handlers = ReturnType<typeof useLongPress>

const target = document.createElement('div')

function pointer(overrides: Partial<{ pointerType: string; clientX: number; clientY: number; button: number }> = {}) {
  return { pointerType: 'touch', clientX: 10, clientY: 10, button: 0, target, ...overrides } as unknown as React.PointerEvent
}

function setup(enabled = true) {
  const onLongPress = vi.fn()
  const { result } = renderHook(() => useLongPress(onLongPress, { enabled }))
  const h = () => result.current as Handlers
  return { onLongPress, h }
}

beforeEach(() => {
  vi.useFakeTimers()
  Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vi.fn() })
})
afterEach(() => vi.useRealTimers())

describe('useLongPress', () => {
  it('fires after 400 ms of holding still, with the pressed element, and buzzes', () => {
    const { onLongPress, h } = setup()
    act(() => h().onPointerDown(pointer()))
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS - 1))
    expect(onLongPress).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(LONG_PRESS_MS).toBe(400)
    expect(onLongPress).toHaveBeenCalledWith(target)
    expect(navigator.vibrate).toHaveBeenCalledWith(10)
  })

  it('a short tap does nothing', () => {
    const { onLongPress, h } = setup()
    act(() => h().onPointerDown(pointer()))
    act(() => vi.advanceTimersByTime(200))
    act(() => h().onPointerUp(pointer()))
    act(() => vi.advanceTimersByTime(1000))
    expect(onLongPress).not.toHaveBeenCalled()
  })

  it('moving more than 8 px cancels (a scroll), less does not', () => {
    const { onLongPress, h } = setup()
    act(() => h().onPointerDown(pointer()))
    act(() => h().onPointerMove(pointer({ clientX: 16, clientY: 14 })))
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS))
    expect(onLongPress).toHaveBeenCalledTimes(1)

    act(() => h().onPointerDown(pointer()))
    act(() => h().onPointerMove(pointer({ clientY: 19 })))
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS))
    expect(onLongPress).toHaveBeenCalledTimes(1)
  })

  it('pointercancel (iOS taking over for a scroll) cancels', () => {
    const { onLongPress, h } = setup()
    act(() => h().onPointerDown(pointer()))
    act(() => h().onPointerCancel(pointer()))
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS))
    expect(onLongPress).not.toHaveBeenCalled()
  })

  it('ignores the mouse, and does nothing when disabled', () => {
    const mouse = setup()
    act(() => mouse.h().onPointerDown(pointer({ pointerType: 'mouse' })))
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS))
    expect(mouse.onLongPress).not.toHaveBeenCalled()

    const off = setup(false)
    act(() => off.h().onPointerDown(pointer()))
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS))
    expect(off.onLongPress).not.toHaveBeenCalled()
  })

  it('swallows the click that ends a long-press, but not an ordinary click', () => {
    const { h } = setup()
    const click = () => ({ preventDefault: vi.fn(), stopPropagation: vi.fn() }) as unknown as React.MouseEvent
    const plain = click()
    act(() => h().onClickCapture(plain))
    expect(plain.stopPropagation).not.toHaveBeenCalled()

    act(() => h().onPointerDown(pointer()))
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS))
    act(() => h().onPointerUp(pointer()))
    const after = click()
    act(() => h().onClickCapture(after))
    expect(after.preventDefault).toHaveBeenCalled()
    expect(after.stopPropagation).toHaveBeenCalled()
    // Only that one click.
    const next = click()
    act(() => h().onClickCapture(next))
    expect(next.stopPropagation).not.toHaveBeenCalled()
  })

  it('blocks the native context menu (the iOS callout) while enabled', () => {
    const { h } = setup()
    const e = { preventDefault: vi.fn() } as unknown as React.MouseEvent
    h().onContextMenu(e)
    expect(e.preventDefault).toHaveBeenCalled()
  })
})
