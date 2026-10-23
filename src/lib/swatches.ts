/**
 * The status colour palette (design §11, the profile editor mockup), in display order. Each reads
 * well as a dot and a pill tint in every theme. Lower-case hex, so a stored colour is compared
 * after `toLowerCase()`.
 */
export const STATUS_SWATCHES = [
  '#ef4444',
  '#f97316',
  '#f5a524',
  '#22c55e',
  '#14b8a6',
  '#3b82f6',
  '#6366f1',
  '#a855f7',
  '#ec4899',
  '#f472b6',
  '#94a3b8',
] as const

/** Whether `colour` is one of the preset swatches (case-insensitive). */
export function isPresetSwatch(colour: string | null | undefined): boolean {
  return !!colour && (STATUS_SWATCHES as readonly string[]).includes(colour.toLowerCase())
}
