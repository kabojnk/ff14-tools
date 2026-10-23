import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useUiStore } from '@/stores/uiStore'

interface PortalProps {
  children: React.ReactNode
}

/**
 * Renders into its own node on `document.body`. Everything portalled belongs to the chat, so while the FF14
 * disguise is up the node is hidden and inert (not unmounted: a half-edited sheet comes back as it was).
 */
export function Portal({ children }: PortalProps) {
  const el = useRef(document.createElement('div'))
  const disguised = useUiStore((s) => s.eepMode)

  useEffect(() => {
    const container = el.current
    document.body.appendChild(container)
    return () => {
      document.body.removeChild(container)
    }
  }, [])

  useEffect(() => {
    el.current.hidden = disguised
    el.current.toggleAttribute('inert', disguised)
  }, [disguised])

  return createPortal(children, el.current)
}
