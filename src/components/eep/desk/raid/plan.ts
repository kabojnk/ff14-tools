import { PARTY_IDS, type ArenaShape, type Formation, type PlanStep, type Pt, type Shape } from './fights'

/** A step as saved on this device: `base` is the mock step it started from (Reset step goes back to it). */
export type SavedStep = PlanStep & { base: number }
/** Saved plans by fight id; a fight without an entry shows its mock plan. */
export type SavedPlans = Record<string, SavedStep[]>

export type Tool = 'move' | 'aoe' | 'cone' | 'line' | 'tower' | 'erase'
export const MAX_STEPS = 12

export function fromMock(steps: PlanStep[]): SavedStep[] {
  return steps.map((s, i) => ({ ...s, base: i }))
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isPt = (v: unknown): v is Pt => Array.isArray(v) && v.length === 2 && isNum(v[0]) && isNum(v[1])

function isShape(v: unknown): v is Shape {
  if (!Array.isArray(v) || typeof v[0] !== 'string') return false
  switch (v[0]) {
    case 'aoe':
      return isNum(v[1]) && isNum(v[2]) && (v[3] === undefined || v[3] === null || isNum(v[3]))
    case 'stack':
    case 'tower':
      return isNum(v[1]) && isNum(v[2])
    case 'cone':
    case 'line':
    case 'donut':
      return isNum(v[1]) && isNum(v[2]) && isNum(v[3])
    case 'half':
      return ['n', 'e', 's', 'w'].includes(v[1] as string)
    case 'split':
    case 'ring':
      return true
    default:
      return false
  }
}

function isStep(v: unknown): v is SavedStep {
  if (!v || typeof v !== 'object') return false
  const s = v as Partial<SavedStep>
  return (
    typeof s.name === 'string' &&
    typeof s.note === 'string' &&
    isNum(s.base) &&
    !!s.party &&
    typeof s.party === 'object' &&
    PARTY_IDS.every((id) => isPt((s.party as Formation)[id])) &&
    Array.isArray(s.shapes) &&
    s.shapes.every(isShape)
  )
}

/** The saved steps for a fight, or null when there are none or they don't parse (then the mock shows). */
export function savedSteps(plans: unknown, fightId: string): SavedStep[] | null {
  if (!plans || typeof plans !== 'object') return null
  const steps = (plans as Record<string, unknown>)[fightId]
  return Array.isArray(steps) && steps.length > 0 && steps.length <= MAX_STEPS && steps.every(isStep) ? steps : null
}

/** Keeps a token on the floor (its 14-unit radius inside the square, or inside the circle). */
export function clampToArena(arena: ArenaShape, [x, y]: Pt): Pt {
  if (arena === 'circle') {
    const dx = x - 200
    const dy = y - 200
    const d = Math.hypot(dx, dy)
    const max = 166
    if (d > max) return [Math.round(200 + (dx / d) * max), Math.round(200 + (dy / d) * max)]
    return [Math.round(x), Math.round(y)]
  }
  return [Math.round(Math.min(366, Math.max(34, x))), Math.round(Math.min(366, Math.max(34, y)))]
}

/** Angle (degrees clockwise from north) from the boss to a point. */
function bearing([x, y]: Pt): number {
  if (Math.hypot(x - 200, y - 200) < 1) return 0
  return Math.round(((Math.atan2(x - 200, 200 - y) * 180) / Math.PI + 360) % 360)
}

/** The shape a placing tool drops at a tapped point. Cones and lines are aimed from the boss toward the tap. */
export function placeShape(tool: Exclude<Tool, 'move' | 'erase'>, p: Pt): Shape {
  const [x, y] = [Math.round(p[0]), Math.round(p[1])]
  if (tool === 'aoe') return ['aoe', x, y, 46]
  if (tool === 'tower') return ['tower', x, y]
  if (tool === 'cone') return ['cone', 200, 200, bearing(p)]
  return ['line', 200, 200, bearing(p)]
}

/** Viewport point → arena (viewBox 400×400, xMidYMid meet) coordinates, or null when the arena has no size. */
export function toArena(rect: { left: number; top: number; width: number; height: number }, clientX: number, clientY: number): Pt | null {
  if (!rect.width || !rect.height) return null
  const scale = Math.min(rect.width, rect.height) / 400
  const ox = rect.left + (rect.width - 400 * scale) / 2
  const oy = rect.top + (rect.height - 400 * scale) / 2
  return [(clientX - ox) / scale, (clientY - oy) / scale]
}

export function shareUrl(fightId: string): string {
  return `https://aetherdesk.app/plan/${fightId}`
}
