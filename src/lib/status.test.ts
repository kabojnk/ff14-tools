import { describe, expect, it } from 'vitest'
import { presenceColor, presenceLabel, presenceOf } from '@/lib/status'

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
  it('uses the theme presence tokens', () => {
    expect(presenceColor('online')).toBe('var(--presence-online)')
    expect(presenceColor('away')).toBe('var(--presence-away)')
    expect(presenceColor('offline')).toBe('var(--presence-offline)')
  })

  it('labels each presence', () => {
    expect(presenceLabel('online')).toBe('Online')
    expect(presenceLabel('away')).toBe('Away')
    expect(presenceLabel('offline')).toBe('Offline')
  })
})
