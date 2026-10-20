import { useCallback, useEffect, useRef } from 'react'

export const LONG_PRESS_MS = 400
/** Further than this from the press point, the finger is scrolling, not pressing. */
const MOVE_TOLERANCE_PX = 8

interface Options {
  enabled?: boolean
}

/**
 * Long-press on touch (and pen) with pointer events. A press held still for 400 ms calls `onLongPress`
 * with the element pressed. Moving more than 8 px, lifting, or a `pointercancel` (iOS taking the touch
 * over for a scroll) cancels it. The click that ends a long-press is swallowed, so a long-press on a
 * photo doesn't also open it. The element should have `touch-action: pan-y`, `user-select: none` and
 * `-webkit-touch-callout: none` so the browser's own long-press (selection, callout) stays out of the way.
 */
export function useLongPress(onLongPress: (target: Element) => void, { enabled = true }: Options = {}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const swallowClick = useRef(false)
  const callback = useRef(onLongPress)
  callback.current = onLongPress

  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    start.current = null
  }, [])

  useEffect(() => cancel, [cancel])

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // A long-press whose click never came (iOS often sends none) mustn't eat this press's click.
      swallowClick.current = false
      if (!enabled || e.pointerType === 'mouse' || e.button > 0) return
      cancel()
      const target = e.target as Element
      start.current = { x: e.clientX, y: e.clientY }
      timer.current = setTimeout(() => {
        timer.current = null
        start.current = null
        swallowClick.current = true
        navigator.vibrate?.(10)
        callback.current(target)
      }, LONG_PRESS_MS)
    },
    [enabled, cancel],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const s = start.current
      if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > MOVE_TOLERANCE_PX) cancel()
    },
    [cancel],
  )

  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (!swallowClick.current) return
    swallowClick.current = false
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (enabled) e.preventDefault()
    },
    [enabled],
  )

  const end = cancel as (e: React.PointerEvent) => void
  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: end,
    onPointerCancel: end,
    onPointerLeave: end,
    onClickCapture,
    onContextMenu,
  }
}
