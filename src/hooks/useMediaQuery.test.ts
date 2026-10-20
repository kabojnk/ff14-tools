import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DESKTOP_QUERY, useMediaQuery } from '@/hooks/useMediaQuery'

type Listener = (e: { matches: boolean }) => void

function mockMatchMedia(initial: boolean) {
  const listeners = new Set<Listener>()
  const mql = {
    matches: initial,
    addEventListener: (_: 'change', l: Listener) => listeners.add(l),
    removeEventListener: (_: 'change', l: Listener) => listeners.delete(l),
  }
  vi.stubGlobal('matchMedia', vi.fn(() => mql))
  return {
    change(matches: boolean) {
      mql.matches = matches
      listeners.forEach((l) => l({ matches }))
    },
    listenerCount: () => listeners.size,
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('useMediaQuery', () => {
  it('returns the current match', () => {
    mockMatchMedia(true)
    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'))
    expect(result.current).toBe(true)
  })

  it('updates when the media query changes', () => {
    const mq = mockMatchMedia(false)
    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'))
    expect(result.current).toBe(false)
    act(() => mq.change(true))
    expect(result.current).toBe(true)
  })

  it('removes its listener on unmount', () => {
    const mq = mockMatchMedia(false)
    const { unmount } = renderHook(() => useMediaQuery('(min-width: 768px)'))
    expect(mq.listenerCount()).toBe(1)
    unmount()
    expect(mq.listenerCount()).toBe(0)
  })

  it('returns false when matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined)
    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'))
    expect(result.current).toBe(false)
  })
})

describe('DESKTOP_QUERY', () => {
  it('needs a wide screen with a mouse, so landscape phones stay in the phone layout', () => {
    expect(DESKTOP_QUERY).toBe('(min-width: 900px) and (hover: hover) and (pointer: fine)')
  })
})
