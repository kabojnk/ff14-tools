import { useEffect, useState } from 'react'

export interface KeyboardViewport {
  /** The visible height above the on-screen keyboard. */
  height: number
  /** How far iOS has panned the page down to show the focused field. */
  top: number
}

/**
 * The visible area while the on-screen keyboard is open (phones), else null. iOS keeps the layout
 * viewport full height under the keyboard and may pan it to reveal the focused field, so the app is
 * sized and moved to the visual viewport: the composer then sits right on top of the keyboard and the
 * header stays in view.
 */
export function useKeyboardViewport(enabled: boolean): KeyboardViewport | null {
  const [area, setArea] = useState<KeyboardViewport | null>(null)
  useEffect(() => {
    const vv = window.visualViewport
    if (!enabled || !vv) {
      setArea(null)
      return
    }
    const update = () => {
      const open = vv.height < window.innerHeight - 100
      const next = open ? { height: Math.round(vv.height), top: Math.max(0, Math.round(vv.offsetTop)) } : null
      setArea((prev) => (prev?.height === next?.height && prev?.top === next?.top ? prev : next))
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [enabled])
  return area
}
