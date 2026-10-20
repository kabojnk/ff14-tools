import { describe, expect, it } from 'vitest'
import { dateChipLabel, insertDateChips, localDayKey } from '@/lib/chat/dates'

const TZ = 'America/New_York'
const opts = { locale: 'en-US', timeZone: TZ }
// Monday 19 October 2026, 10:00 in New York (UTC-4)
const now = new Date('2026-10-19T14:00:00Z')

describe('localDayKey', () => {
  it('uses the given time zone, not UTC', () => {
    // 02:30 UTC on the 20th is still the 19th in New York
    expect(localDayKey('2026-10-20T02:30:00Z', TZ)).toBe('2026-10-19')
    expect(localDayKey('2026-10-20T02:30:00Z', 'UTC')).toBe('2026-10-20')
  })
})

describe('dateChipLabel', () => {
  it('says TODAY for earlier the same local day', () => {
    expect(dateChipLabel('2026-10-19T04:00:00Z', now, opts)).toBe('TODAY') // 00:00 NY
  })

  it('says YESTERDAY one second before local midnight', () => {
    expect(dateChipLabel('2026-10-19T03:59:59Z', now, opts)).toBe('YESTERDAY') // 23:59:59 NY on the 18th
  })

  it('treats a slightly future timestamp (clock skew) as TODAY', () => {
    expect(dateChipLabel('2026-10-20T04:00:01Z', now, opts)).toBe('TODAY')
  })

  it('uses the weekday name from 2 to 6 days back', () => {
    expect(dateChipLabel('2026-10-17T15:00:00Z', now, opts)).toBe('SATURDAY')
    expect(dateChipLabel('2026-10-13T15:00:00Z', now, opts)).toBe('TUESDAY')
  })

  it('uses the short date once a week has passed (no repeat of today’s weekday)', () => {
    expect(dateChipLabel('2026-10-12T15:00:00Z', now, opts)).toBe('OCT 12')
  })

  it('adds the year when it differs', () => {
    expect(dateChipLabel('2025-12-31T15:00:00Z', now, opts)).toBe('DEC 31, 2025')
  })

  it('decides the year in the local time zone', () => {
    // 03:00 UTC on 1 Jan 2026 is still 31 Dec 2025 in New York
    expect(dateChipLabel('2026-01-01T03:00:00Z', now, opts)).toBe('DEC 31, 2025')
  })

  it('counts calendar days across a DST change', () => {
    // NY falls back on 1 Nov 2026; now = Wed 4 Nov 10:00 EST
    const after = new Date('2026-11-04T15:00:00Z')
    expect(dateChipLabel('2026-10-31T15:00:00Z', after, opts)).toBe('SATURDAY')
    expect(dateChipLabel('2026-11-03T05:00:00Z', after, opts)).toBe('YESTERDAY') // 00:00 EST on the 3rd
  })

  it('honours the locale', () => {
    expect(dateChipLabel('2026-10-17T15:00:00Z', now, { locale: 'fr-FR', timeZone: TZ })).toBe('SAMEDI')
  })

  it('accepts a Date', () => {
    expect(dateChipLabel(new Date('2026-10-18T15:00:00Z'), now, opts)).toBe('YESTERDAY')
  })
})

describe('insertDateChips', () => {
  const row = (id: string, created_at: string) => ({ message: { id, created_at } })

  it('returns nothing for no rows', () => {
    expect(insertDateChips([], now, opts)).toEqual([])
  })

  it('puts a chip before the first row and wherever the local day changes', () => {
    const rows = [
      row('a', '2026-10-18T20:00:00Z'), // 16:00 NY 18th
      row('b', '2026-10-19T03:59:59Z'), // 23:59:59 NY 18th
      row('c', '2026-10-19T04:00:00Z'), // 00:00 NY 19th
      row('d', '2026-10-19T04:00:00Z'), // identical timestamp
    ]
    const out = insertDateChips(rows, now, opts)
    expect(out.map((i) => (i.kind === 'chip' ? `chip:${i.label}` : i.row.message.id))).toEqual([
      'chip:YESTERDAY',
      'a',
      'b',
      'chip:TODAY',
      'c',
      'd',
    ])
  })

  it('gives each chip a stable key from its local day', () => {
    const out = insertDateChips([row('a', '2026-10-19T12:00:00Z')], now, opts)
    expect(out[0]).toEqual({ kind: 'chip', key: 'chip:2026-10-19', label: 'TODAY' })
  })
})
