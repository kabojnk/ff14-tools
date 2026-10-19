import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SHAKE_MS, usePinEntry } from '@/components/pin/usePinEntry'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const PINS = { 4: '1234', 5: '13579', 6: '567890' } as const

describe.each([4, 5, 6] as const)('usePinEntry (length %i)', (length) => {
  const pin = PINS[length]

  function setup() {
    const onComplete = vi.fn()
    const hook = renderHook(() => usePinEntry({ length, onComplete }))
    return { onComplete, hook }
  }

  it('completes once with the full PIN and locks into verifying', () => {
    const { onComplete, hook } = setup()
    for (const d of pin) act(() => hook.result.current.press(d))
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(onComplete).toHaveBeenCalledWith(pin)
    expect(hook.result.current.status).toBe('verifying')
    expect(hook.result.current.count).toBe(length)
    expect(hook.result.current.isLocked()).toBe(true)
  })

  it('does not lose taps that arrive before a re-render', () => {
    const { onComplete, hook } = setup()
    const { press } = hook.result.current
    act(() => {
      for (const d of pin) press(d)
    })
    expect(onComplete).toHaveBeenCalledWith(pin)
    expect(hook.result.current.count).toBe(length)
  })

  it('ignores taps while verifying', () => {
    const { onComplete, hook } = setup()
    act(() => {
      for (const d of pin) hook.result.current.press(d)
      hook.result.current.press('9')
      hook.result.current.backspace()
    })
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(hook.result.current.count).toBe(length)
  })

  it('backspace removes the last digit', () => {
    const { onComplete, hook } = setup()
    act(() => {
      hook.result.current.press('1')
      hook.result.current.press('2')
      hook.result.current.backspace()
    })
    expect(hook.result.current.count).toBe(1)
    act(() => {
      for (const d of pin.slice(1)) hook.result.current.press(d)
    })
    expect(onComplete).toHaveBeenCalledWith('1' + pin.slice(1))
  })

  it('fail shows the error, then clears and unlocks after the shake', () => {
    const { onComplete, hook } = setup()
    act(() => {
      for (const d of pin) hook.result.current.press(d)
    })
    act(() => hook.result.current.fail())
    expect(hook.result.current.status).toBe('error')
    expect(hook.result.current.count).toBe(length)

    act(() => vi.advanceTimersByTime(SHAKE_MS))
    expect(hook.result.current.status).toBe('idle')
    expect(hook.result.current.count).toBe(0)
    expect(hook.result.current.isLocked()).toBe(false)

    act(() => {
      for (const d of pin) hook.result.current.press(d)
    })
    expect(onComplete).toHaveBeenCalledTimes(2)
  })

  it('reset clears the buffer and unlocks immediately', () => {
    const { onComplete, hook } = setup()
    act(() => {
      for (const d of pin) hook.result.current.press(d)
    })
    act(() => hook.result.current.reset())
    expect(hook.result.current).toMatchObject({ status: 'idle', count: 0 })
    act(() => hook.result.current.press('1'))
    expect(hook.result.current.count).toBe(1)
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('succeed marks the entry successful', () => {
    const { hook } = setup()
    act(() => {
      for (const d of pin) hook.result.current.press(d)
    })
    act(() => hook.result.current.succeed())
    expect(hook.result.current.status).toBe('success')
  })
})
