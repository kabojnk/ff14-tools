import { useCallback, useSyncExternalStore } from 'react'

/**
 * The desktop layout: wide, with a mouse. A landscape iPhone (852 px, coarse pointer) and any
 * touch-first screen stay in the phone layout.
 */
export const DESKTOP_QUERY = '(min-width: 900px) and (hover: hover) and (pointer: fine)'

function getMatch(query: string) {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(query).matches
    : false
}

/** Reactive `matchMedia`: re-renders when the query starts or stops matching. */
export function useMediaQuery(query: string): boolean {
  // Stable per query, so React doesn't resubscribe on every render.
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window.matchMedia !== 'function') return () => {}
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    [query],
  )

  return useSyncExternalStore(
    subscribe,
    () => getMatch(query),
    () => false,
  )
}
