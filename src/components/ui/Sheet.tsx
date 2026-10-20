import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'
import { Portal } from '@/components/ui/Portal'
import { Icon } from '@/components/ui/Icon'
import { DESKTOP_QUERY, useMediaQuery } from '@/hooks/useMediaQuery'

interface SheetProps {
  /** The heading; also the dialog's accessible name. */
  title: string
  onClose: () => void
  /** Left of the title: 'cancel' (text button "Cancel"), 'back' (icon button "Back") or nothing. Default 'cancel'. */
  leading?: 'cancel' | 'back' | 'none'
  /** The leading button's handler. Default `onClose`. */
  onLeading?: () => void
  /** What Escape does when this is the topmost sheet. Default `onClose` (e.g. a pushed section passes its Back). */
  onEscape?: () => void
  /** Right of the title, e.g. { label: 'Save', onClick, disabled }. Bold accent text. */
  action?: { label: string; onClick: () => void; disabled?: boolean }
  /** Desktop width in px (default 440). */
  width?: number
  /**
   * Desktop only: leave out the header bar (title, leading and action), for a dialog that draws its
   * own (Settings). The hidden title still names the dialog.
   */
  hideHeaderOnDesktop?: boolean
  children: ReactNode
}

// Open sheets, by open order. A sheet's order is fixed at its first render, which runs parent
// before child and earlier before later, so the largest mounted order is the topmost sheet.
let nextOrder = 0
const openSheets = new Set<number>()
const topmost = () => Math.max(-1, ...openSheets)
// An Escape one sheet acted on; no other sheet acts on the same event.
const handledEscapes = new WeakSet<Event>()

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** The PinPad sits above everything (z-[70]) and owns the keyboard while it's open. */
const pinPadOpen = () => document.querySelector('[data-pin-pad]') !== null

/**
 * A full-height sheet on phones, a centred dialog over a dim backdrop on desktop (design §11).
 *
 * - **One tree:** crossing the DESKTOP_QUERY breakpoint changes only classes, so children (and any
 *   staged state in them) stay mounted.
 * - **Escape:** one bubble-phase listener on `document` that never stops propagation, so the
 *   double-Esc disguise shortcut on `window` still fires. Only the topmost open sheet reacts. It's
 *   ignored when a child already called `preventDefault()` (an inline edit handling its own Esc), or
 *   while the PinPad (`[data-pin-pad]`) is open.
 * - **Focus:** moves into the sheet on open, is trapped on Tab (topmost sheet only, not while the
 *   PinPad is open) and returns to the opener on close.
 * - **Layers:** sheets and dialogs are `z-50`; the photo viewer is `z-[60]`; the PinPad `z-[70]`.
 */
export function Sheet({
  title,
  onClose,
  leading = 'cancel',
  onLeading,
  onEscape,
  action,
  width = 440,
  hideHeaderOnDesktop = false,
  children,
}: SheetProps) {
  const isDesktop = useMediaQuery(DESKTOP_QUERY)
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const [order] = useState(() => nextOrder++)
  // Read while rendering, before this sheet's effects move focus.
  const [opener] = useState(() => (typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null)))

  const escapeRef = useRef(onEscape ?? onClose)
  escapeRef.current = onEscape ?? onClose

  useEffect(() => {
    openSheets.add(order)
    if (topmost() === order && !panelRef.current?.contains(document.activeElement)) {
      panelRef.current?.focus()
    }
    return () => {
      openSheets.delete(order)
      if (opener?.isConnected) opener.focus()
    }
  }, [order, opener])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (topmost() !== order || pinPadOpen()) return
      if (e.key === 'Escape') {
        if (e.defaultPrevented || handledEscapes.has(e)) return
        handledEscapes.add(e)
        escapeRef.current()
      } else if (e.key === 'Tab') {
        const panel = panelRef.current
        if (!panel) return
        const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
        if (items.length === 0) {
          e.preventDefault()
          panel.focus()
          return
        }
        const i = items.indexOf(document.activeElement as HTMLElement)
        const next = e.shiftKey
          ? items[i <= 0 ? items.length - 1 : i - 1]
          : items[i < 0 || i === items.length - 1 ? 0 : i + 1]
        e.preventDefault()
        next.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [order])

  const link = 'inline-flex items-center rounded-md text-[13.5px] text-[color:var(--accent)] outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]'

  return (
    <Portal>
      <div className={`fixed inset-0 z-50 flex ${isDesktop ? 'items-center justify-center p-4' : 'flex-col'}`}>
        {/* Always rendered, so the panel keeps its place in the tree across the breakpoint. */}
        <div
          data-testid="sheet-backdrop"
          aria-hidden="true"
          onClick={isDesktop ? onClose : undefined}
          className={`absolute inset-0 ${isDesktop ? 'sheet-dim bg-black/45' : ''}`}
        />
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          style={isDesktop ? { width } : undefined}
          className={`relative flex flex-col overflow-hidden bg-[color:var(--wall)] text-[color:var(--fg)] outline-none ${
            isDesktop ? 'max-h-[90vh] max-w-full rounded-2xl shadow-[0_20px_50px_var(--shadow)]' : 'sheet-up h-full w-full'
          }`}
        >
          <header
            hidden={isDesktop && hideHeaderOnDesktop}
            className={`grid flex-none grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-[color:var(--line)] bg-[color:var(--bar)] px-3.5 pb-2.5 ${
              isDesktop ? 'pt-3' : 'pt-[max(10px,env(safe-area-inset-top))]'
            }`}
          >
            <div className="justify-self-start">
              {leading === 'cancel' && (
                <button type="button" onClick={onLeading ?? onClose} className={link}>
                  Cancel
                </button>
              )}
              {leading === 'back' && (
                <button type="button" aria-label="Back" onClick={onLeading ?? onClose} className={`${link} -ml-1 p-1`}>
                  <Icon icon={ChevronLeft} size={22} />
                </button>
              )}
            </div>
            <h2 id={titleId} className="truncate text-center text-[15px] font-semibold">
              {title}
            </h2>
            <div className="justify-self-end">
              {action && (
                <button
                  type="button"
                  onClick={action.onClick}
                  disabled={action.disabled}
                  className={`${link} font-bold disabled:opacity-40`}
                >
                  {action.label}
                </button>
              )}
            </div>
          </header>
          <div className={`min-h-0 flex-1 overflow-y-auto ${isDesktop ? '' : 'pb-safe'}`}>{children}</div>
        </div>
      </div>
    </Portal>
  )
}
