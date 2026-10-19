import { useCallback, useEffect, useRef, useState } from 'react'
import { SHAKE_MS, usePinEntry } from '@/components/pin/usePinEntry'

/** Lengths offered when setting a new PIN. */
export type PinLength = 4 | 5 | 6

interface PinPadProps {
  mode: 'unlock' | 'set'
  /** Required in unlock mode: the stored PIN's length. Set mode lets the user choose (default 6). */
  length?: number
  /** Unlock mode: resolves true when the PIN is correct. The pad never compares PINs itself. */
  verify?: (pin: string) => Promise<boolean>
  /**
   * Unlock: the accepted PIN. Set: the confirmed new PIN.
   * If it returns a rejected promise, the pad stays open, shows "Couldn't save. Try again." and accepts input again.
   */
  onSuccess: (pin: string) => void | Promise<void>
  onCancel?: () => void
  title?: string
}

const SUCCESS_MS = 250

const KEYS: { digit: string; letters: string }[] = [
  { digit: '1', letters: '' },
  { digit: '2', letters: 'ABC' },
  { digit: '3', letters: 'DEF' },
  { digit: '4', letters: 'GHI' },
  { digit: '5', letters: 'JKL' },
  { digit: '6', letters: 'MNO' },
  { digit: '7', letters: 'PQRS' },
  { digit: '8', letters: 'TUV' },
  { digit: '9', letters: 'WXYZ' },
]

const LENGTH_OPTIONS: PinLength[] = [4, 5, 6]

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

export function PinPad({ mode, length = 6, verify, onSuccess, onCancel, title }: PinPadProps) {
  const reduceMotion = prefersReducedMotion()
  const [chosenLength, setChosenLength] = useState<PinLength>(6)
  const [step, setStep] = useState<'enter' | 'confirm'>('enter')
  const [message, setMessage] = useState<string | null>(null)
  const [showOptions, setShowOptions] = useState(false)
  const [flashKey, setFlashKey] = useState<string | null>(null)
  const firstPinRef = useRef<string | null>(null)
  const successTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const mountedRef = useRef(true)
  const entryRef = useRef<ReturnType<typeof usePinEntry> | null>(null)

  const activeLength = mode === 'set' ? chosenLength : length

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      clearTimeout(successTimerRef.current)
    }
  }, [])

  const finish = useCallback(
    (pin: string) => {
      entryRef.current?.succeed()
      successTimerRef.current = setTimeout(() => {
        if (!mountedRef.current) return
        Promise.resolve(onSuccess(pin)).catch(() => {
          if (!mountedRef.current) return
          firstPinRef.current = null
          setStep('enter')
          setMessage("Couldn't save. Try again.")
          entryRef.current?.fail()
        })
      }, reduceMotion ? 0 : SUCCESS_MS)
    },
    [onSuccess, reduceMotion],
  )

  const handleComplete = useCallback(
    (pin: string) => {
      const entry = entryRef.current
      if (!entry) return

      if (mode === 'unlock') {
        if (!verify) return
        verify(pin)
          .then((ok) => {
            if (!mountedRef.current) return
            setMessage(null)
            if (ok) finish(pin)
            else entryRef.current?.fail()
          })
          .catch(() => {
            if (!mountedRef.current) return
            setMessage("Couldn't verify. Try again.")
            entryRef.current?.fail()
          })
        return
      }

      if (firstPinRef.current === null) {
        firstPinRef.current = pin
        setMessage(null)
        entry.reset()
        setStep('confirm')
        return
      }

      if (pin === firstPinRef.current) {
        finish(pin)
      } else {
        firstPinRef.current = null
        setMessage('Passcodes did not match. Try again.')
        setStep('enter')
        entry.fail()
      }
    },
    [mode, verify, finish],
  )

  const entry = usePinEntry({
    length: activeLength,
    onComplete: handleComplete,
    shakeMs: reduceMotion ? 0 : SHAKE_MS,
  })
  entryRef.current = entry

  const pressDigit = useCallback((digit: string) => {
    const current = entryRef.current
    if (!current || current.isLocked()) return
    setMessage(null)
    current.press(digit)
  }, [])

  const cancel = useCallback(() => {
    // Once a PIN is being verified (or has succeeded), the result stands; ignore Cancel.
    if (entryRef.current?.isLocked()) return
    onCancel?.()
  }, [onCancel])

  // Hardware keyboard support (desktop). Capture phase, so keys the pad handles never reach other
  // window shortcuts (e.g. the double-Escape Eep shortcut); keys typed into a text field are left alone.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable) return

      if (/^[0-9]$/.test(e.key)) pressDigit(e.key)
      else if (e.key === 'Backspace') entryRef.current?.backspace()
      else if (e.key === 'Escape') cancel()
      else return

      e.preventDefault()
      e.stopImmediatePropagation()
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [pressDigit, cancel])

  const chooseLength = (next: PinLength) => {
    setChosenLength(next)
    setShowOptions(false)
    entry.reset()
  }

  const heading =
    title ??
    (mode === 'unlock' ? 'Enter Passcode' : step === 'enter' ? 'Enter New Passcode' : 'Confirm New Passcode')

  const keyDown = (digit: string) => (e: React.PointerEvent) => {
    e.preventDefault()
    setFlashKey(digit)
    pressDigit(digit)
  }
  const keyUp = () => setFlashKey(null)

  const renderKey = (digit: string, letters: string) => (
    <button
      key={digit}
      type="button"
      aria-label={digit}
      data-pin-key={digit}
      onPointerDown={keyDown(digit)}
      onPointerUp={keyUp}
      onPointerLeave={keyUp}
      onPointerCancel={keyUp}
      className={`relative flex h-[78px] w-[78px] flex-col items-center justify-center rounded-full text-white transition-colors duration-100 before:absolute before:-inset-2 before:content-[''] ${
        flashKey === digit ? 'bg-white/45' : 'bg-white/15'
      }`}
    >
      <span className="text-[34px] font-light leading-none">{digit}</span>
      <span className="mt-0.5 h-3 text-[10px] font-semibold tracking-[0.2em]">{letters}</span>
    </button>
  )

  const showOptionsLink = mode === 'set' && step === 'enter' && entry.count === 0

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={heading}
      className={`fixed inset-0 z-[70] flex select-none flex-col items-center justify-center bg-black/55 backdrop-blur-2xl ${
        entry.status === 'success' ? 'pin-pad-exit' : ''
      }`}
      style={{
        touchAction: 'manipulation',
        WebkitTouchCallout: 'none',
        WebkitUserSelect: 'none',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {/* Lock glyph */}
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </svg>

      <p className="mt-3 text-[20px] font-normal text-white">{heading}</p>

      <div
        data-testid="pin-dots"
        data-state={entry.status}
        data-filled={entry.count}
        className={`mt-5 flex gap-4 ${entry.status === 'error' ? 'pin-shake' : ''}`}
      >
        {Array.from({ length: activeLength }, (_, i) => (
          <span
            key={i}
            className={`h-3.5 w-3.5 rounded-full border-[1.5px] border-white ${i < entry.count ? 'bg-white' : 'bg-transparent'}`}
          />
        ))}
      </div>

      <p role="status" aria-live="polite" className="mt-3 h-5 text-sm text-white/80">
        {message ?? ''}
      </p>

      <div className="mt-6 grid grid-cols-3 gap-x-6 gap-y-4">
        {KEYS.map(({ digit, letters }) => renderKey(digit, letters))}
        <div />
        {renderKey('0', '')}
        {entry.count > 0 ? (
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault()
              entry.backspace()
            }}
            className="h-[78px] w-[78px] text-[17px] text-white"
          >
            Delete
          </button>
        ) : onCancel ? (
          <button type="button" onClick={cancel} className="h-[78px] w-[78px] text-[17px] text-white">
            Cancel
          </button>
        ) : (
          <div />
        )}
      </div>

      <div className="mt-6 h-10">
        {showOptionsLink && (
          <div className="relative flex flex-col items-center">
            <button type="button" onClick={() => setShowOptions((s) => !s)} className="text-[15px] text-white">
              Passcode Options
            </button>
            {showOptions && (
              <div className="absolute bottom-8 w-60 overflow-hidden rounded-xl bg-neutral-800/95 text-white shadow-xl">
                {LENGTH_OPTIONS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => chooseLength(n)}
                    className="block w-full border-b border-white/10 px-4 py-3 text-center text-[15px] last:border-b-0 hover:bg-white/10"
                  >
                    {n}-Digit Numeric Code
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
