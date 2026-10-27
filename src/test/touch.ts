import { act, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'

type Point = [x: number, y: number]

const touch = (target: Element, [x, y]: Point) => ({ identifier: 1, target, clientX: x, clientY: y })

/**
 * One finger on `target`: down at the first point, through the others `stepMs` apart (fake timers),
 * then up at the last (or cancelled). Returns whether each move was cancelled (`preventDefault`).
 */
export function drag(target: Element, points: Point[], { stepMs = 100, end = 'touchEnd' }: { stepMs?: number; end?: 'touchEnd' | 'touchCancel' } = {}) {
  const prevented: boolean[] = []
  act(() => {
    fireEvent.touchStart(target, { touches: [touch(target, points[0])], changedTouches: [touch(target, points[0])] })
  })
  for (const p of points.slice(1)) {
    act(() => vi.advanceTimersByTime(stepMs))
    act(() => {
      prevented.push(!fireEvent.touchMove(target, { touches: [touch(target, p)], changedTouches: [touch(target, p)] }))
    })
  }
  const last = points[points.length - 1]
  act(() => {
    fireEvent[end](target, { touches: [], changedTouches: [touch(target, last)] })
  })
  return prevented
}

/** A slow drag from `from` to `to` in `steps` moves (well under the flick speed). */
export const path = (from: Point, to: Point, steps = 10): Point[] =>
  Array.from({ length: steps + 1 }, (_, i) => [from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps])
