import { describe, expect, it } from 'vitest'
import { DEFAULT_FIGHT_ID, FIGHTS, PARTY_IDS, findFight, type Expansion, type FightKind } from './fights'
import { clampToArena, fromMock, placeShape, savedSteps, toArena } from './plan'

const count = (exp: Expansion, kind: FightKind) => FIGHTS.filter((f) => f.exp === exp && f.kind === kind).length

describe('fight data', () => {
  it('lists every Savage and Extreme fight from Shadowbringers on', () => {
    expect(count('shb', 'savage')).toBe(12)
    expect(count('shb', 'extreme')).toBe(8)
    expect(count('ew', 'savage')).toBe(12)
    expect(count('ew', 'extreme')).toBe(7)
    expect(count('dt', 'savage')).toBe(12)
    expect(count('dt', 'extreme')).toBe(7)
    expect(FIGHTS).toHaveLength(58)
  })

  it('has unique ids and defaults to M9S', () => {
    expect(new Set(FIGHTS.map((f) => f.id)).size).toBe(FIGHTS.length)
    expect(findFight(DEFAULT_FIGHT_ID)?.boss).toBe('Vamp Fatale')
  })

  it('numbers savage floors in order', () => {
    const codes = FIGHTS.filter((f) => f.kind === 'savage').map((f) => f.code)
    for (const prefix of ['E', 'P', 'M']) {
      expect(codes.filter((c) => c?.startsWith(prefix))).toEqual(Array.from({ length: 12 }, (_, i) => `${prefix}${i + 1}S`))
    }
    expect(FIGHTS.filter((f) => f.kind === 'extreme').every((f) => !f.code)).toBe(true)
  })

  it.each(FIGHTS.map((f) => [f.id, f] as const))('%s has a usable 3–5 step strategy', (_, f) => {
    expect(f.steps.length).toBeGreaterThanOrEqual(3)
    expect(f.steps.length).toBeLessThanOrEqual(5)
    for (const s of f.steps) {
      expect(s.name).not.toBe('')
      expect(s.note).toMatch(/\*\*.+?\*\*/)
      for (const id of PARTY_IDS) {
        const [x, y] = s.party[id]
        if (f.arena === 'circle') expect(Math.hypot(x - 200, y - 200)).toBeLessThanOrEqual(182 - 14)
        else for (const v of [x, y]) expect(v >= 34 && v <= 366).toBe(true)
      }
    }
    // The mock passes the same check stored plans do.
    expect(savedSteps({ [f.id]: fromMock(f.steps) }, f.id)).not.toBeNull()
  })
})

describe('plan helpers', () => {
  it('keeps dragged tokens on the floor', () => {
    expect(clampToArena('square', [0, 500])).toEqual([34, 366])
    const [x, y] = clampToArena('circle', [400, 200])
    expect([x, y]).toEqual([366, 200])
  })

  it('aims cones and lines from the boss', () => {
    expect(placeShape('cone', [200, 50])).toEqual(['cone', 200, 200, 0])
    expect(placeShape('line', [350, 200])).toEqual(['line', 200, 200, 90])
    expect(placeShape('aoe', [10.4, 20.6])).toEqual(['aoe', 10, 21, 46])
  })

  it('maps screen points into the 400×400 arena', () => {
    expect(toArena({ left: 10, top: 20, width: 200, height: 200 }, 110, 120)).toEqual([200, 200])
    expect(toArena({ left: 0, top: 0, width: 0, height: 0 }, 1, 1)).toBeNull()
  })

  it('ignores junk in storage', () => {
    expect(savedSteps({ m9s: [{ name: 'x' }] }, 'm9s')).toBeNull()
    expect(savedSteps('nope', 'm9s')).toBeNull()
    expect(savedSteps({}, 'm9s')).toBeNull()
  })
})
