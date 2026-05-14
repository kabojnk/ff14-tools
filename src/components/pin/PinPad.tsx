import { useState, useEffect } from 'react'

interface PinPadProps {
  title: string
  subtitle?: string
  error?: boolean
  onComplete: (pin: string) => void
  onCancel?: () => void
}

const DIGITS = ['1','2','3','4','5','6','7','8','9','','0','⌫']

export function PinPad({ title, subtitle, error, onComplete, onCancel }: PinPadProps) {
  const [digits, setDigits] = useState<string[]>([])

  // Reset digits when error fires (wrong PIN)
  useEffect(() => {
    if (error) {
      const t = setTimeout(() => setDigits([]), 600)
      return () => clearTimeout(t)
    }
  }, [error])

  const press = (key: string) => {
    if (key === '') return
    if (key === '⌫') {
      setDigits((d) => d.slice(0, -1))
      return
    }
    if (digits.length >= 4) return
    const next = [...digits, key]
    setDigits(next)
    if (next.length === 4) {
      // Small delay so the 4th dot fills before callback
      setTimeout(() => onComplete(next.join('')), 80)
    }
  }

  return (
    <div className="flex flex-col items-center gap-8 select-none">
      {/* Title */}
      <div className="text-center">
        <p className="text-lg font-semibold text-white/90">{title}</p>
        {subtitle && <p className="mt-1 text-sm text-white/50">{subtitle}</p>}
      </div>

      {/* 4-dot display */}
      <div className="flex gap-5">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-4 w-4 rounded-full border-2 transition-all duration-100 ${
              i < digits.length
                ? error
                  ? 'border-red-400 bg-red-400'
                  : 'border-white bg-white'
                : 'border-white/40 bg-transparent'
            }`}
          />
        ))}
      </div>

      {/* Numpad */}
      <div className="grid grid-cols-3 gap-3">
        {DIGITS.map((key, i) => (
          key === '' ? (
            <div key={i} />
          ) : (
            <button
              key={i}
              onClick={() => press(key)}
              className={`flex h-16 w-16 items-center justify-center rounded-full text-xl font-medium text-white transition-colors ${
                key === '⌫'
                  ? 'bg-transparent text-white/60 hover:text-white active:text-white/40'
                  : 'bg-white/10 hover:bg-white/20 active:bg-white/5'
              }`}
            >
              {key}
            </button>
          )
        ))}
      </div>

      {/* Cancel */}
      {onCancel && (
        <button
          onClick={onCancel}
          className="text-sm text-white/50 hover:text-white/80"
        >
          Cancel
        </button>
      )}
    </div>
  )
}
