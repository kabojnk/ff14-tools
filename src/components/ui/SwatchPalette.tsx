import { useRef, type KeyboardEvent } from 'react'
import { STATUS_SWATCHES } from '@/lib/swatches'

interface SwatchPaletteProps {
  /** The current colour as hex (`#rrggbb`). */
  value: string
  onChange: (hex: string) => void
}

// The selected swatch's double ring, from the mockup: a gap in the card colour, then the text colour.
const RING = '0 0 0 2px var(--them), 0 0 0 4px var(--fg)'

/**
 * The status colour picker (design §11): the 11 preset swatches as a radiogroup, then a dashed "＋"
 * circle over a native colour input for any other colour. A value that isn't a preset shows as the
 * custom circle, filled with that colour. Arrow keys move between presets and select as they go.
 */
export function SwatchPalette({ value, onChange }: SwatchPaletteProps) {
  const current = value.toLowerCase()
  const presetIndex = (STATUS_SWATCHES as readonly string[]).indexOf(current)
  const isCustom = presetIndex < 0
  const radioRefs = useRef<(HTMLButtonElement | null)[]>([])

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    e.preventDefault()
    const n = STATUS_SWATCHES.length
    const next = (index + step + n) % n
    radioRefs.current[next]?.focus()
    onChange(STATUS_SWATCHES[next])
  }

  const circle = 'relative grid aspect-square w-full place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]'

  return (
    <div role="radiogroup" aria-label="Colour" className="grid grid-cols-6 gap-[7px]">
      {STATUS_SWATCHES.map((hex, i) => {
        const selected = i === presetIndex
        return (
          <button
            key={hex}
            ref={(el) => {
              radioRefs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-label={hex}
            aria-checked={selected}
            tabIndex={selected || (isCustom && i === 0) ? 0 : -1}
            onClick={() => onChange(hex)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={circle}
            style={{ background: hex, boxShadow: selected ? RING : undefined }}
          />
        )
      })}
      <label
        data-swatch-custom=""
        data-selected={isCustom}
        title="Pick any colour"
        className={`${circle} cursor-pointer text-[13px] text-[color:var(--muted)] focus-within:ring-2 focus-within:ring-[color:var(--accent)] ${
          isCustom ? '' : 'border-[1.5px] border-dashed border-[color:var(--muted)]'
        }`}
        style={isCustom ? { background: current, boxShadow: RING } : undefined}
      >
        {!isCustom && <span aria-hidden="true">＋</span>}
        <input
          type="color"
          aria-label="Custom colour"
          value={isCustom ? current : '#ffffff'}
          onChange={(e) => onChange(e.target.value.toLowerCase())}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>
    </div>
  )
}
