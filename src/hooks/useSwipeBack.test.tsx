import { useRef } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EXIT_MS, SPRING_MS, useSwipeBack, type SwipeDirection } from '@/hooks/useSwipeBack'
import { drag, path } from '@/test/touch'

// jsdom lays nothing out: the element's size falls back to the window's (1024 × 768), so the
// threshold (35%) is 358 px across and 269 px down.

function Screen(props: { direction: SwipeDirection; onSwipe: () => void; enabled?: boolean; canStart?: () => boolean; leaves?: () => boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useSwipeBack(ref, props)
  return (
    <div ref={ref} data-testid="screen">
      <p>Content</p>
      <input aria-label="Field" />
      <div data-testid="scroller" style={{ overflowY: 'auto' }}>
        <p>Inner</p>
      </div>
    </div>
  )
}

function setup(props: Partial<Parameters<typeof Screen>[0]> = {}) {
  const onSwipe = vi.fn()
  render(<Screen direction="right" onSwipe={onSwipe} {...props} />)
  const el = screen.getByTestId('screen')
  return { onSwipe, el, content: screen.getByText('Content') }
}

const finish = (ms = EXIT_MS) => act(() => vi.advanceTimersByTime(ms))

let reduced = false
beforeEach(() => {
  vi.useFakeTimers()
  reduced = false
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('prefers-reduced-motion') && reduced,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useSwipeBack, right (edge swipe)', () => {
  it('from the left edge past 35%: follows the finger, moves out, then calls onSwipe', () => {
    const { onSwipe, el, content } = setup()
    const prevented = drag(content, path([10, 300], [410, 310]))
    // Once locked across, the moves are cancelled so nothing scrolls underneath.
    expect(prevented.slice(-3)).toEqual([true, true, true])
    expect(el.style.transform).toBe('translate3d(1024px,0,0)')
    expect(onSwipe).not.toHaveBeenCalled()
    finish()
    expect(onSwipe).toHaveBeenCalledTimes(1)
    expect(el.style.transform).toBe('')
  })

  it('claims the first small moves that head right, before the lock, so iOS never starts a scroll', () => {
    const { content } = setup()
    fireEvent.touchStart(content, { touches: [{ clientX: 5, clientY: 300 }] })
    expect(fireEvent.touchMove(content, { touches: [{ clientX: 8, clientY: 301 }] })).toBe(false)
    // But a first move mostly down is left to scroll.
    fireEvent.touchEnd(content, { touches: [], changedTouches: [{ clientX: 8, clientY: 301 }] })
    fireEvent.touchStart(content, { touches: [{ clientX: 5, clientY: 300 }] })
    expect(fireEvent.touchMove(content, { touches: [{ clientX: 6, clientY: 304 }] })).toBe(true)
  })

  it('the element follows the finger during the drag', () => {
    const { el, content } = setup()
    fireEvent.touchStart(content, { touches: [{ clientX: 5, clientY: 300 }] })
    fireEvent.touchMove(content, { touches: [{ clientX: 25, clientY: 302 }] })
    fireEvent.touchMove(content, { touches: [{ clientX: 125, clientY: 305 }] })
    expect(el.style.transform).toBe('translate3d(120px,0,0)')
    // Back past the start, it stays put rather than moving left.
    fireEvent.touchMove(content, { touches: [{ clientX: 0, clientY: 305 }] })
    expect(el.style.transform).toBe('')
  })

  it('a start away from the edge does nothing, and the moves stay scrollable', () => {
    const { onSwipe, el, content } = setup()
    const prevented = drag(content, path([60, 300], [560, 300]))
    expect(prevented.every((p) => !p)).toBe(true)
    expect(el.style.transform).toBe('')
    finish(1000)
    expect(onSwipe).not.toHaveBeenCalled()
  })

  it('a drag that goes up or down first is abandoned for the rest of the touch', () => {
    const { onSwipe, el, content } = setup()
    // 12 px down first (a scroll), then far to the right.
    const prevented = drag(content, [[10, 300], [12, 312], [100, 312], [500, 312]])
    expect(prevented.every((p) => !p)).toBe(true)
    expect(el.style.transform).toBe('')
    finish(1000)
    expect(onSwipe).not.toHaveBeenCalled()
  })

  it('a drag to the left from the edge is not a swipe', () => {
    const { onSwipe, content } = setup()
    drag(content, [[20, 300], [5, 300], [0, 300]])
    finish(1000)
    expect(onSwipe).not.toHaveBeenCalled()
  })

  it('released short of 35% and slowly, it springs back', () => {
    const { onSwipe, el, content } = setup()
    drag(content, path([10, 300], [300, 300]))
    expect(el.style.transform).toBe('')
    expect(el.style.transition).toContain(`${SPRING_MS}ms`)
    finish(SPRING_MS)
    expect(el.style.transition).toBe('')
    finish(1000)
    expect(onSwipe).not.toHaveBeenCalled()
  })

  it('a fast flick completes it from a short distance', () => {
    const { onSwipe, content } = setup()
    // 120 px in 40 ms: 3 px/ms.
    drag(content, path([10, 300], [130, 300], 4), { stepMs: 10 })
    finish()
    expect(onSwipe).toHaveBeenCalledTimes(1)
  })

  it('a flick that ends going back the other way does not complete', () => {
    const { onSwipe, content } = setup()
    drag(content, [[10, 300], [100, 300], [200, 300], [150, 300], [100, 300]], { stepMs: 10 })
    finish(1000)
    expect(onSwipe).not.toHaveBeenCalled()
  })

  it('a touchcancel (the system took the touch) springs back', () => {
    const { onSwipe, el, content } = setup()
    drag(content, path([10, 300], [500, 300]), { end: 'touchCancel' })
    expect(el.style.transform).toBe('')
    finish(1000)
    expect(onSwipe).not.toHaveBeenCalled()
  })

  it('ignores mice: mouse and pointer events never move it', () => {
    const { onSwipe, el, content } = setup()
    fireEvent.pointerDown(content, { pointerType: 'mouse', clientX: 5, clientY: 300 })
    fireEvent.mouseDown(content, { clientX: 5, clientY: 300 })
    fireEvent.pointerMove(content, { pointerType: 'mouse', clientX: 600, clientY: 300 })
    fireEvent.mouseMove(content, { clientX: 600, clientY: 300 })
    fireEvent.pointerUp(content, { pointerType: 'mouse', clientX: 600, clientY: 300 })
    fireEvent.mouseUp(content, { clientX: 600, clientY: 300 })
    finish(1000)
    expect(el.style.transform).toBe('')
    expect(onSwipe).not.toHaveBeenCalled()
  })

  it('never starts on a field', () => {
    const { onSwipe } = setup()
    drag(screen.getByRole('textbox', { name: 'Field' }), path([10, 300], [600, 300]))
    finish(1000)
    expect(onSwipe).not.toHaveBeenCalled()
  })

  it('does nothing when disabled or when canStart says no', () => {
    const a = setup({ enabled: false })
    drag(a.content, path([10, 300], [600, 300]))
    finish(1000)
    expect(a.onSwipe).not.toHaveBeenCalled()
    cleanup()

    const canStart = vi.fn(() => false)
    const b = setup({ canStart })
    drag(b.content, path([10, 300], [600, 300]))
    finish(1000)
    expect(canStart).toHaveBeenCalled()
    expect(b.onSwipe).not.toHaveBeenCalled()
  })

  it('a second finger abandons it', () => {
    const { onSwipe, el, content } = setup()
    fireEvent.touchStart(content, { touches: [{ clientX: 5, clientY: 300 }] })
    fireEvent.touchMove(content, { touches: [{ clientX: 100, clientY: 300 }] })
    fireEvent.touchMove(content, { touches: [{ clientX: 500, clientY: 300 }, { clientX: 600, clientY: 300 }] })
    fireEvent.touchEnd(content, { touches: [], changedTouches: [{ clientX: 500, clientY: 300 }] })
    finish(1000)
    expect(el.style.transform).toBe('')
    expect(onSwipe).not.toHaveBeenCalled()
  })

  it('with leaves() false, springs back and calls onSwipe straight away', () => {
    const { onSwipe, el, content } = setup({ leaves: () => false })
    drag(content, path([10, 300], [500, 300]))
    expect(onSwipe).toHaveBeenCalledTimes(1)
    expect(el.style.transform).toBe('')
  })

  describe('reduced motion', () => {
    beforeEach(() => {
      reduced = true
    })

    it('nothing follows the finger; a release past the threshold just calls onSwipe', () => {
      const { onSwipe, el, content } = setup()
      fireEvent.touchStart(content, { touches: [{ clientX: 5, clientY: 300 }] })
      fireEvent.touchMove(content, { touches: [{ clientX: 300, clientY: 300 }] })
      expect(el.style.transform).toBe('')
      fireEvent.touchMove(content, { touches: [{ clientX: 500, clientY: 300 }] })
      fireEvent.touchEnd(content, { touches: [], changedTouches: [{ clientX: 500, clientY: 300 }] })
      expect(onSwipe).toHaveBeenCalledTimes(1)
    })

    it('a release short of it does nothing', () => {
      const { onSwipe, content } = setup()
      drag(content, path([10, 300], [200, 300]))
      finish(1000)
      expect(onSwipe).not.toHaveBeenCalled()
    })
  })
})

describe('useSwipeBack, down (pull to dismiss)', () => {
  it('a pull down from anywhere past 35% moves it down and out, then calls onSwipe', () => {
    const { onSwipe, el, content } = setup({ direction: 'down' })
    drag(content, path([200, 100], [205, 400]))
    expect(el.style.transform).toBe('translate3d(0,768px,0)')
    finish()
    expect(onSwipe).toHaveBeenCalledTimes(1)
  })

  it('a pull up, or sideways, is left to scroll', () => {
    const { onSwipe, el, content } = setup({ direction: 'down' })
    const up = drag(content, path([200, 400], [200, 50]))
    const across = drag(content, path([200, 100], [600, 120]))
    expect([...up, ...across].every((p) => !p)).toBe(true)
    expect(el.style.transform).toBe('')
    finish(1000)
    expect(onSwipe).not.toHaveBeenCalled()
  })

  it('does not start inside something scrolled down from its top', () => {
    const { onSwipe } = setup({ direction: 'down' })
    const scroller = screen.getByTestId('scroller')
    scroller.scrollTop = 40
    drag(screen.getByText('Inner'), path([200, 100], [200, 500]))
    finish(1000)
    expect(onSwipe).not.toHaveBeenCalled()
  })

  it('released short of 35% and slowly, it springs back', () => {
    const { onSwipe, el, content } = setup({ direction: 'down' })
    drag(content, path([200, 100], [200, 300]))
    finish(1000)
    expect(el.style.transform).toBe('')
    expect(onSwipe).not.toHaveBeenCalled()
  })
})
