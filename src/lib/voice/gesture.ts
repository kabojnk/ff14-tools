/** A press shorter than this records nothing ("Hold to record"). */
export const SHORT_TAP_MS = 500
/** Sliding this far left cancels. */
export const CANCEL_PX = 120
/** Sliding this far up locks (hands-free). */
export const LOCK_PX = 80

export type GestureState =
  | { mode: 'idle' }
  | { mode: 'holding'; pointerId: number; x0: number; y0: number; t0: number; dx: number; dy: number }

export type GestureEvent =
  | { type: 'down'; pointerId: number; pointerType: string; x: number; y: number; t: number }
  | { type: 'move'; pointerId: number; x: number; y: number }
  | { type: 'up'; pointerId: number; t: number }
  | { type: 'cancel'; pointerId: number }
  | { type: 'reset' }

/**
 * - start: a finger went down (record while held).
 * - start-locked: a mouse press (desktop records hands-free at once).
 * - send: released after SHORT_TAP_MS.
 * - short-tap: released sooner.
 * - cancel: slid left, or the system took the pointer.
 * - lock: slid up.
 */
export type GestureAction = 'start' | 'start-locked' | 'send' | 'short-tap' | 'cancel' | 'lock' | null

export const IDLE: GestureState = { mode: 'idle' }

/** The hold-to-record gesture on the mic button. Pure: the composer feeds it pointer events and acts on the result. */
export function step(state: GestureState, ev: GestureEvent): { state: GestureState; action: GestureAction } {
  if (ev.type === 'reset') return { state: IDLE, action: null }
  if (ev.type === 'down') {
    if (state.mode !== 'idle') return { state, action: null }
    if (ev.pointerType === 'mouse') return { state: IDLE, action: 'start-locked' }
    return { state: { mode: 'holding', pointerId: ev.pointerId, x0: ev.x, y0: ev.y, t0: ev.t, dx: 0, dy: 0 }, action: 'start' }
  }
  if (state.mode !== 'holding' || ev.pointerId !== state.pointerId) return { state, action: null }
  if (ev.type === 'move') {
    const dx = Math.min(0, ev.x - state.x0)
    const dy = Math.min(0, ev.y - state.y0)
    if (-dx >= CANCEL_PX) return { state: IDLE, action: 'cancel' }
    if (-dy >= LOCK_PX) return { state: IDLE, action: 'lock' }
    return { state: { ...state, dx, dy }, action: null }
  }
  if (ev.type === 'up') return { state: IDLE, action: ev.t - state.t0 < SHORT_TAP_MS ? 'short-tap' : 'send' }
  return { state: IDLE, action: 'cancel' }
}
