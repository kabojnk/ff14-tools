import { useRef } from 'react'
import { formatDuration } from '@/lib/gallery'

/** Seconds an arrow key moves. */
const KEY_STEP_S = 5

/** `peaks` (0–100) stretched or squeezed to `n` bars; missing peaks draw a flat line at 30. */
export function resample(peaks: number[] | undefined, n: number): number[] {
  if (!peaks || peaks.length === 0) return Array(n).fill(30)
  return Array.from({ length: n }, (_, i) => peaks[Math.min(peaks.length - 1, Math.floor((i * peaks.length) / n))])
}

interface WaveformProps {
  peaks: number[] | undefined
  /** Seconds. */
  position: number
  /** Seconds. */
  duration: number
  /** Called with a time in seconds. */
  onSeek: (seconds: number) => void
  label: string
  bars?: number
  /** A dot at the position (while a memo is playing or part-played). */
  thumb?: boolean
}

/**
 * A memo's waveform as a slider: bars up to the position use --wave-on, the rest --wave-off (set by the
 * parent). Tap or drag to seek; arrow keys step 5 s.
 */
export function Waveform({ peaks, position, duration, onSeek, label, bars = 40, thumb = false }: WaveformProps) {
  const ref = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const heights = resample(peaks, bars)
  const fraction = duration > 0 ? Math.min(1, Math.max(0, position / duration)) : 0
  const onBars = Math.round(fraction * bars)
  const clamp = (s: number) => Math.min(duration, Math.max(0, s))

  const seekAt = (clientX: number) => {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return
    onSeek(clamp(((clientX - rect.left) / rect.width) * duration))
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    const to =
      e.key === 'ArrowRight' || e.key === 'ArrowUp'
        ? position + KEY_STEP_S
        : e.key === 'ArrowLeft' || e.key === 'ArrowDown'
          ? position - KEY_STEP_S
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? duration
              : null
    if (to === null) return
    e.preventDefault()
    onSeek(clamp(to))
  }

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(position)}
      aria-valuetext={`${formatDuration(position)} of ${formatDuration(duration)}`}
      onKeyDown={onKeyDown}
      onPointerDown={(e) => {
        e.stopPropagation()
        dragging.current = true
        try {
          e.currentTarget.setPointerCapture(e.pointerId)
        } catch {
          // A pointer that already ended: the tap still seeks.
        }
        seekAt(e.clientX)
      }}
      onPointerMove={(e) => {
        if (dragging.current) seekAt(e.clientX)
      }}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
      onClick={(e) => e.stopPropagation()}
      className="relative flex h-7 min-w-0 flex-1 cursor-pointer touch-pan-y items-center gap-[2px] rounded outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--wave-on)]"
    >
      {heights.map((h, i) => (
        <span
          key={i}
          data-bar={i < onBars ? 'on' : 'off'}
          aria-hidden="true"
          className={`block w-[3px] flex-none rounded-[2px] ${i < onBars ? 'bg-[color:var(--wave-on)]' : 'bg-[color:var(--wave-off)]'}`}
          style={{ height: `${Math.round(4 + (h / 100) * 22)}px` }}
        />
      ))}
      {thumb && (
        <span
          data-thumb
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[color:var(--wave-on)] shadow-[0_0_0_2px_var(--wave-ring,transparent)]"
          style={{ left: `${fraction * 100}%` }}
        />
      )}
    </div>
  )
}
