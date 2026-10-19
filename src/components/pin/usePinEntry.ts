import { useCallback, useEffect, useRef, useState } from 'react'

export type PinEntryStatus = 'idle' | 'verifying' | 'error' | 'success'

export const SHAKE_MS = 400

interface UsePinEntryOptions {
  length: number
  onComplete: (pin: string) => void
  shakeMs?: number
}

/**
 * Digit buffer for the PIN pad. The buffer lives in a ref so rapid taps that
 * land before React re-renders are never dropped; `count` mirrors it for rendering.
 * Input locks once `length` digits are entered and stays locked until the caller
 * resolves the attempt with `fail`, `succeed` or `reset`.
 */
export function usePinEntry({ length, onComplete, shakeMs = SHAKE_MS }: UsePinEntryOptions) {
  const bufferRef = useRef('')
  const lockedRef = useRef(false)
  const onCompleteRef = useRef(onComplete)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()
  const [count, setCount] = useState(0)
  const [status, setStatus] = useState<PinEntryStatus>('idle')

  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  useEffect(() => () => clearTimeout(timerRef.current), [])

  const clearBuffer = useCallback(() => {
    bufferRef.current = ''
    setCount(0)
  }, [])

  const press = useCallback(
    (digit: string) => {
      if (lockedRef.current || bufferRef.current.length >= length) return
      bufferRef.current += digit
      setCount(bufferRef.current.length)
      if (bufferRef.current.length === length) {
        lockedRef.current = true
        setStatus('verifying')
        onCompleteRef.current(bufferRef.current)
      }
    },
    [length],
  )

  const backspace = useCallback(() => {
    if (lockedRef.current) return
    bufferRef.current = bufferRef.current.slice(0, -1)
    setCount(bufferRef.current.length)
  }, [])

  const fail = useCallback(() => {
    setStatus('error')
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      clearBuffer()
      lockedRef.current = false
      setStatus('idle')
    }, shakeMs)
  }, [clearBuffer, shakeMs])

  const succeed = useCallback(() => setStatus('success'), [])

  const reset = useCallback(() => {
    clearTimeout(timerRef.current)
    clearBuffer()
    lockedRef.current = false
    setStatus('idle')
  }, [clearBuffer])

  // True from completion until fail/reset settles; lets callers ignore Cancel mid-verify.
  const isLocked = useCallback(() => lockedRef.current, [])

  return { count, status, press, backspace, fail, succeed, reset, isLocked }
}
