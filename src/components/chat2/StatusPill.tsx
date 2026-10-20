import type { CSSProperties } from 'react'

interface StatusPillProps {
  label: string
  /** The status definition's colour (#rrggbb). */
  color: string
  className?: string
}

/** Pill A (tinted): a soft wash of the status colour, a solid 7 px dot and the label. */
export function StatusPill({ label, color, className = '' }: StatusPillProps) {
  const style = {
    backgroundColor: `color-mix(in srgb, ${color} 18%, transparent)`,
    color: `color-mix(in srgb, ${color} 65%, var(--fg))`,
  } satisfies CSSProperties
  return (
    <span
      data-status-pill
      className={`inline-flex max-w-full items-center gap-[5px] whitespace-nowrap rounded-full py-[2px] pl-1.5 pr-2 text-[10.5px] font-semibold leading-[1.35] ${className}`}
      style={style}
    >
      <i data-pill-dot aria-hidden className="h-[7px] w-[7px] flex-none rounded-full" style={{ backgroundColor: color }} />
      <span data-status-label className="truncate">
        {label}
      </span>
    </span>
  )
}
