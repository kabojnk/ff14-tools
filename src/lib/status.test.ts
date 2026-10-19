import { describe, expect, it } from 'vitest'
import { groupMembers, presenceColor, presenceLabel, presenceOf } from '@/lib/status'
import type { Presence, StatusDefinition } from '@/types'

describe('presenceOf', () => {
  it.each(['online', 'away', 'offline'] as const)('keeps %s', (p) => {
    expect(presenceOf(p)).toBe(p)
  })

  it.each(['under_close_watch', 'found_out', 'you_can_call', 'potential_eep'])(
    'treats legacy custom value %s as online',
    (s) => {
      expect(presenceOf(s)).toBe('online')
    },
  )

  it.each([null, undefined, ''])('treats missing %j as offline', (s) => {
    expect(presenceOf(s)).toBe('offline')
  })
})

describe('presence display', () => {
  it('uses the status colour tokens', () => {
    expect(presenceColor('online')).toBe('hsl(var(--color-status-online))')
    expect(presenceColor('away')).toBe('hsl(var(--color-status-away))')
    expect(presenceColor('offline')).toBe('hsl(var(--color-status-offline))')
  })

  it('labels each presence', () => {
    expect(presenceLabel('online')).toBe('Online')
    expect(presenceLabel('away')).toBe('Away')
    expect(presenceLabel('offline')).toBe('Offline')
  })
})

describe('groupMembers', () => {
  const def = (id: string, label: string, position: number): StatusDefinition => ({
    id, label, color: '#112233', position, legacy_key: null, created_by: null,
    created_at: '2026-10-19T00:00:00Z', updated_at: '2026-10-19T00:00:00Z',
  })
  const m = (id: string, presence: Presence, statusId: string | null = null) => ({ id, presence, statusId })
  const defs = [def('s1', 'Found Out', 0), def('s2', 'Raiding', 1)]

  it('puts members with a custom status under its label, in definition order, then the rest by presence', () => {
    const groups = groupMembers(
      [m('a', 'online', 's2'), m('b', 'offline', 's1'), m('c', 'online'), m('d', 'away'), m('e', 'offline')],
      defs,
    )
    expect(groups.map((g) => [g.key, g.label, g.members.map((x) => x.id)])).toEqual([
      ['status:s1', 'Found Out', ['b']],
      ['status:s2', 'Raiding', ['a']],
      ['online', 'Online', ['c']],
      ['away', 'Away', ['d']],
      ['offline', 'Offline', ['e']],
    ])
    expect(groups[0].color).toBe('#112233')
  })

  it('omits empty status groups and treats an unknown status id as none', () => {
    const groups = groupMembers([m('a', 'online', 'gone'), m('b', 'offline')], defs)
    expect(groups.map((g) => [g.key, g.members.map((x) => x.id)])).toEqual([
      ['online', ['a']],
      ['away', []],
      ['offline', ['b']],
    ])
  })
})
