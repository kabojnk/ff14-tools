import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useKeyboardViewport } from '@/hooks/useKeyboardViewport'

class FakeViewport extends EventTarget {
  height = 800
  offsetTop = 0
  set(height: number, offsetTop = 0) {
    this.height = height
    this.offsetTop = offsetTop
    this.dispatchEvent(new Event('resize'))
  }
}

let vv: FakeViewport
const original = Object.getOwnPropertyDescriptor(window, 'visualViewport')

beforeEach(() => {
  vv = new FakeViewport()
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: vv })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })
})

afterEach(() => {
  if (original) Object.defineProperty(window, 'visualViewport', original)
  else delete (window as { visualViewport?: unknown }).visualViewport
})

describe('useKeyboardViewport', () => {
  it('is null while no keyboard is open', () => {
    const { result } = renderHook(() => useKeyboardViewport(true))
    expect(result.current).toBeNull()
  })

  it('follows the visible area while the keyboard is open, including iOS panning it down', () => {
    const { result } = renderHook(() => useKeyboardViewport(true))
    act(() => vv.set(450))
    expect(result.current).toEqual({ height: 450, top: 0 })
    act(() => {
      vv.offsetTop = 120
      vv.dispatchEvent(new Event('scroll'))
    })
    expect(result.current).toEqual({ height: 450, top: 120 })
    act(() => vv.set(800))
    expect(result.current).toBeNull()
  })

  it('does nothing when disabled (desktop)', () => {
    const { result } = renderHook(() => useKeyboardViewport(false))
    act(() => vv.set(450))
    expect(result.current).toBeNull()
  })
})
