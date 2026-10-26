import { describe, expect, it } from 'vitest'
import { CANCEL_PX, IDLE, LOCK_PX, SHORT_TAP_MS, step, type GestureEvent, type GestureState } from '@/lib/voice/gesture'

function run(events: GestureEvent[], from: GestureState = IDLE) {
  let state = from
  const actions: string[] = []
  for (const ev of events) {
    const r = step(state, ev)
    state = r.state
    if (r.action) actions.push(r.action)
  }
  return { state, actions }
}

const down = (t = 0, pointerType = 'touch'): GestureEvent => ({ type: 'down', pointerId: 1, pointerType, x: 300, y: 600, t })
const move = (dx: number, dy: number, pointerId = 1): GestureEvent => ({ type: 'move', pointerId, x: 300 + dx, y: 600 + dy })
const up = (t: number, pointerId = 1): GestureEvent => ({ type: 'up', pointerId, t })

describe('voice gesture', () => {
  it('a touch press starts; a release after 0.5 s sends', () => {
    expect(run([down(0), up(SHORT_TAP_MS)]).actions).toEqual(['start', 'send'])
  })

  it('a release before 0.5 s is a short tap', () => {
    expect(run([down(0), up(SHORT_TAP_MS - 1)]).actions).toEqual(['start', 'short-tap'])
  })

  it('sliding left 120 px cancels; less only tracks the drag', () => {
    const near = run([down(), move(-(CANCEL_PX - 1), 0)])
    expect(near.actions).toEqual(['start'])
    expect(near.state).toMatchObject({ mode: 'holding', dx: -(CANCEL_PX - 1), dy: 0 })
    expect(run([down(), move(-CANCEL_PX, 0)]).actions).toEqual(['start', 'cancel'])
  })

  it('sliding up 80 px locks, and the release then does nothing', () => {
    const r = run([down(0), move(0, -LOCK_PX), up(2000)])
    expect(r.actions).toEqual(['start', 'lock'])
    expect(r.state).toEqual(IDLE)
  })

  it('right and down movement is ignored', () => {
    expect(run([down(), move(200, 200)]).state).toMatchObject({ dx: 0, dy: 0 })
  })

  it('a mouse press starts locked at once', () => {
    expect(run([down(0, 'mouse'), up(10)]).actions).toEqual(['start-locked'])
  })

  it('a system cancel (permission prompt, scroll) cancels', () => {
    expect(run([down(), { type: 'cancel', pointerId: 1 }]).actions).toEqual(['start', 'cancel'])
  })

  it('ignores other pointers and a second press while holding', () => {
    expect(run([down(0), move(-500, 0, 2), up(900, 2), down(10)]).actions).toEqual(['start'])
  })

  it('reset goes back to idle without an action', () => {
    expect(run([down(), { type: 'reset' }])).toEqual({ state: IDLE, actions: ['start'] })
  })
})
