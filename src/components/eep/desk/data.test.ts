import { describe, expect, it } from 'vitest'
import { CARDS, COLLECTION_KINDS, COLLECTIONS, RECIPES, defaultOwned, formatSpan, resets, sideLabel, untilReset } from '@/components/eep/desk/data'

describe('Aetherdesk data', () => {
  it('has unique ids across recipes and collections', () => {
    const ids = [...RECIPES.map((r) => r.id), ...COLLECTION_KINDS.flatMap((k) => COLLECTIONS[k].items.map((i) => i.id))]
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('collects Triple Triad cards with four sides of 1–10 and 1–5 stars', () => {
    expect(COLLECTIONS.cards.label).toBe('Triple Triad')
    for (const c of CARDS) {
      expect(c.sides).toHaveLength(4)
      for (const s of c.sides) expect(s).toBeGreaterThanOrEqual(1)
      for (const s of c.sides) expect(s).toBeLessThanOrEqual(10)
      expect(c.stars).toBeGreaterThanOrEqual(1)
    }
    expect(sideLabel(10)).toBe('A')
    expect(sideLabel(7)).toBe('7')
  })

  it('starts with some example progress in every collection, but not all of it', () => {
    const owned = new Set(defaultOwned())
    for (const k of COLLECTION_KINDS) {
      const have = COLLECTIONS[k].items.filter((i) => owned.has(i.id)).length
      expect(have).toBeGreaterThan(0)
      expect(have).toBeLessThan(COLLECTIONS[k].items.length)
    }
  })
})

describe('resets', () => {
  it('counts down to the game’s daily (15:00 UTC), weekly (Tue 08:00 UTC) and Grand Company (20:00 UTC) resets', () => {
    // Monday 2026-10-26 14:00 UTC
    const now = new Date(Date.UTC(2026, 9, 26, 14, 0))
    const t = resets(now)
    expect(t.daily).toBe(60 * 60_000)
    expect(t.grandCompany).toBe(6 * 60 * 60_000)
    expect(t.weekly).toBe(18 * 60 * 60_000)
  })

  it('rolls over to the next day or week once the time has passed', () => {
    const tuesdayAfter = new Date(Date.UTC(2026, 9, 27, 9, 0))
    expect(untilReset(tuesdayAfter, 8, 2)).toBe((7 * 24 - 1) * 60 * 60_000)
    expect(untilReset(tuesdayAfter, 8)).toBe(23 * 60 * 60_000)
  })

  it('formats spans the way the cards show them', () => {
    expect(formatSpan((2 * 24 + 4) * 3_600_000 + 5 * 60_000)).toBe('2d 4h')
    expect(formatSpan(5 * 3_600_000 + 12 * 60_000)).toBe('5h 12m')
    expect(formatSpan(9 * 60_000)).toBe('9m')
    expect(formatSpan(-1)).toBe('0m')
  })
})
