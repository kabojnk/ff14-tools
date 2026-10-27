import { useEffect, useRef, type RefObject } from 'react'
import { flushSync } from 'react-dom'

/** Right: an edge swipe starts this close (px) to the left edge, plus the safe-area inset. */
export const EDGE_PX = 28
/** The finger has to move this far (px) before the gesture picks a direction. */
const LOCK_PX = 10
/** Released past this share of the width (right) or height (down), the swipe completes. */
const COMPLETE_SHARE = 0.35
/** A flick this fast (px/ms) in the swipe's direction completes it from anywhere. */
const FLICK_SPEED = 0.5
/** Velocity is measured over the last this many ms of the drag. */
const FLICK_WINDOW_MS = 100
export const EXIT_MS = 200
export const SPRING_MS = 250

/** Starts on these never become a swipe: typing, a slider, a picker. `[data-no-swipe]` opts anything else out. */
const IGNORE = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], [data-no-swipe]'

export type SwipeDirection = 'right' | 'down'

interface Options {
  /** 'right': an edge swipe from the left (back). 'down': a pull down (dismiss a sheet). */
  direction: SwipeDirection
  /** Called once the swipe completes (after the element has moved out, unless it stays; see `leaves`). */
  onSwipe: () => void
  enabled?: boolean
  /** The element that follows the finger. Default: the element listened on. */
  moveRef?: RefObject<HTMLElement | null>
  /** Checked when a finger lands: false leaves this touch alone (another layer is on top). */
  canStart?: () => boolean
  /**
   * Checked when a swipe completes: false means `onSwipe` won't take this screen away (a sheet with
   * unsaved changes asks first), so the element springs back and `onSwipe` runs straight away.
   */
  leaves?: () => boolean
}

interface Drag {
  x0: number
  y0: number
  /** Null until the finger has moved LOCK_PX; then the gesture is ours (true) or abandoned. */
  locked: boolean | null
  /** Recent positions along the swipe axis, for the release velocity. */
  samples: { t: number; d: number }[]
  reduced: boolean
}

const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** `env(safe-area-inset-left)` in px (a landscape iPhone's notch side), read from a hidden probe. */
let probe: HTMLDivElement | null = null
function safeAreaLeft() {
  if (!probe) {
    probe = document.createElement('div')
    probe.setAttribute('aria-hidden', 'true')
    probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding-left:env(safe-area-inset-left)'
    document.body.appendChild(probe)
  }
  return parseFloat(getComputedStyle(probe).paddingLeft) || 0
}

/** Whether something between `target` and `root` (both included) is scrolled away from its top. */
function scrolledBelowTop(target: Element, root: HTMLElement) {
  for (let el: Element | null = target; el; el = el.parentElement) {
    if (el.scrollTop > 0) return true
    if (el === root) break
  }
  return false
}

/**
 * An iOS-style navigation swipe on touch (phones): Back from the left edge (`'right'`), or pulling a
 * sheet down to dismiss it (`'down'`).
 *
 * - **Native touch listeners** on the element, not React handlers: React bubbles events from portals
 *   (the photo viewer, a stacked sheet) to their React parents, but a native listener only hears
 *   touches inside the element's own DOM. Mice (and pens) send no touch events, so they're ignored.
 * - **Starts:** 'right' only within EDGE_PX of the left edge; 'down' anywhere, unless the finger is on
 *   something scrolled down from its top (the content scrolls first, like iOS sheets). Never on a
 *   field, a slider or `[data-no-swipe]`, nor when `canStart` says another layer owns the touch.
 * - **Direction lock:** after LOCK_PX the gesture is ours only if it goes the swipe's way more than
 *   across; otherwise it's abandoned for the rest of the touch (the list scrolls as usual). Once ours,
 *   `touchmove` is cancelled so nothing scrolls underneath, and so are the earlier moves that already
 *   head the swipe's way (iOS picks scrolling on the first moves). If the browser is already scrolling
 *   (the move can't be cancelled) it's abandoned too.
 * - **Follow and release:** the element follows the finger. Released past 35% of its size, or flicked
 *   the right way, it moves out and then `onSwipe` runs; otherwise it springs back. With reduced
 *   motion nothing moves: a release past the threshold just runs `onSwipe`.
 */
export function useSwipeBack(ref: RefObject<HTMLElement | null>, { direction, onSwipe, enabled = true, moveRef, canStart, leaves }: Options) {
  const latest = useRef({ onSwipe, canStart, leaves })
  latest.current = { onSwipe, canStart, leaves }

  useEffect(() => {
    const el = ref.current
    if (!enabled || !el) return
    const moved = () => moveRef?.current ?? el
    let drag: Drag | null = null
    let timer: ReturnType<typeof setTimeout> | null = null

    const setMove = (target: HTMLElement, d: number, ms = 0, ease = 'ease-out') => {
      // An entrance animation's fill (a sheet's `sheet-up`) would override the inline transform. It has
      // played by now, and it stays off: clearing it would play it again.
      target.style.animation = 'none'
      target.style.transition = ms ? `transform ${ms}ms ${ease}` : 'none'
      target.style.transform = d ? (direction === 'right' ? `translate3d(${d}px,0,0)` : `translate3d(0,${d}px,0)`) : ''
    }
    const clear = (target: HTMLElement) => {
      target.style.transition = ''
      target.style.transform = ''
      target.style.willChange = ''
    }
    const springBack = (target: HTMLElement) => {
      setMove(target, 0, SPRING_MS, 'cubic-bezier(0.2, 0.9, 0.3, 1)')
      timer = setTimeout(() => {
        timer = null
        clear(target)
      }, SPRING_MS)
    }

    const onStart = (e: TouchEvent) => {
      drag = null
      if (timer || e.touches.length !== 1) return
      const t = e.touches[0]
      const target = e.target as Element
      if (target.closest?.(IGNORE)) return
      if (latest.current.canStart && !latest.current.canStart()) return
      if (direction === 'right' && t.clientX > EDGE_PX + safeAreaLeft()) return
      if (direction === 'down' && scrolledBelowTop(target, el)) return
      drag = { x0: t.clientX, y0: t.clientY, locked: null, samples: [], reduced: prefersReducedMotion() }
    }

    const onMove = (e: TouchEvent) => {
      const d = drag
      if (!d || d.locked === false) return
      if (e.touches.length !== 1) {
        cancel()
        return
      }
      const t = e.touches[0]
      const dx = t.clientX - d.x0
      const dy = t.clientY - d.y0
      const [along, across] = direction === 'right' ? [dx, dy] : [dy, dx]
      if (d.locked === null) {
        // iOS decides on the first moves whether the touch scrolls, and once it does, later moves can't be
        // cancelled. So moves already going the swipe's way are claimed before the lock; one going any
        // other way is left alone, and that scroll goes ahead.
        if (along > 0 && along >= Math.abs(across) && e.cancelable) e.preventDefault()
        if (Math.hypot(dx, dy) < LOCK_PX) return
        d.locked = along > 0 && along > Math.abs(across) && e.cancelable
        if (!d.locked) return
        if (!d.reduced) moved().style.willChange = 'transform'
      }
      e.preventDefault()
      const pos = Math.max(0, along)
      const now = performance.now()
      d.samples.push({ t: now, d: pos })
      while (d.samples.length > 2 && now - d.samples[0].t > FLICK_WINDOW_MS) d.samples.shift()
      if (!d.reduced) setMove(moved(), pos)
    }

    const onEnd = (e: TouchEvent) => {
      const d = drag
      drag = null
      if (!d?.locked) return
      const target = moved()
      const last = d.samples[d.samples.length - 1]
      const first = d.samples[0]
      const t = e.changedTouches[0]
      const pos = Math.max(0, t ? (direction === 'right' ? t.clientX - d.x0 : t.clientY - d.y0) : last?.d ?? 0)
      const dt = last && first ? last.t - first.t : 0
      const speed = dt > 0 ? (last.d - first.d) / dt : 0
      const size = direction === 'right' ? target.offsetWidth || window.innerWidth : target.offsetHeight || window.innerHeight
      const done = pos > size * COMPLETE_SHARE || (speed > FLICK_SPEED && pos > LOCK_PX)

      if (d.reduced) {
        clear(target)
        if (done) latest.current.onSwipe()
        return
      }
      if (!done) {
        springBack(target)
        return
      }
      if (latest.current.leaves && !latest.current.leaves()) {
        springBack(target)
        latest.current.onSwipe()
        return
      }
      setMove(target, size, EXIT_MS)
      timer = setTimeout(() => {
        timer = null
        // Render the next screen before the element comes back, so the old one never flashes in place.
        flushSync(() => latest.current.onSwipe())
        clear(target)
      }, EXIT_MS)
    }

    const cancel = () => {
      const d = drag
      drag = null
      if (d?.locked) springBack(moved())
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('touchcancel', cancel)
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', cancel)
      if (timer) clearTimeout(timer)
      clear(moved())
    }
  }, [ref, moveRef, enabled, direction])
}
