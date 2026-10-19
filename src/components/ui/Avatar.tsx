import { presenceColor, presenceLabel } from '@/lib/status'
import type { Presence } from '@/types'

interface AvatarProps {
  name: string
  url: string | null | undefined
  /** Diameter in px. */
  size: number
  /** Shows a presence dot in the bottom-right corner. */
  presence?: Presence
}

/** A round avatar (photo or initial) with an optional presence dot ringed in the bar colour. */
export function Avatar({ name, url, size, presence }: AvatarProps) {
  const dot = Math.round(size * 0.3)
  return (
    <span className="relative inline-block flex-none" style={{ width: size, height: size }}>
      {url ? (
        <img src={url} alt="" className="h-full w-full rounded-full object-cover" draggable={false} />
      ) : (
        <span
          aria-hidden
          className="flex h-full w-full items-center justify-center rounded-full bg-[color:var(--accent)] font-bold text-on-accent"
          style={{ fontSize: Math.round(size * 0.38) }}
        >
          {name.charAt(0).toUpperCase() || '?'}
        </span>
      )}
      {presence && (
        <span
          data-presence={presence}
          title={presenceLabel(presence)}
          className="absolute -bottom-px -right-px rounded-full border-2 border-[color:var(--bar)]"
          style={{ width: dot, height: dot, backgroundColor: presenceColor(presence) }}
        />
      )}
    </span>
  )
}
