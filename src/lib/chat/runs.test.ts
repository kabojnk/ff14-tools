import { describe, expect, it } from 'vitest'
import { groupRuns, type RunRow } from '@/lib/chat/runs'

type M = { id: string; author_id: string; created_at: string; type: 'text' | 'gif' | 'system' }
const m = (id: string, author_id: string, created_at: string, type: M['type'] = 'text'): M => ({
  id,
  author_id,
  created_at,
  type,
})
const TZ = 'America/New_York'
const flags = (rows: RunRow<M>[]) =>
  rows.map((r) => `${r.message.id}:${r.runStart ? 'S' : '-'}${r.runEnd ? 'E' : '-'}`)

describe('groupRuns', () => {
  it('returns nothing for no messages', () => {
    expect(groupRuns([])).toEqual([])
  })

  it('marks a lone message as both start and end', () => {
    expect(flags(groupRuns([m('a', 'u1', '2026-10-19T12:00:00Z')], { timeZone: TZ }))).toEqual(['a:SE'])
  })

  it('keeps one author within 5 minutes in one run, including identical timestamps', () => {
    const rows = groupRuns(
      [
        m('a', 'u1', '2026-10-19T12:00:00Z'),
        m('b', 'u1', '2026-10-19T12:00:00Z'),
        m('c', 'u1', '2026-10-19T12:05:00Z'), // exactly 5 minutes after b: same run
      ],
      { timeZone: TZ },
    )
    expect(flags(rows)).toEqual(['a:S-', 'b:--', 'c:-E'])
  })

  it('breaks when more than the gap passes', () => {
    const rows = groupRuns(
      [m('a', 'u1', '2026-10-19T12:00:00Z'), m('b', 'u1', '2026-10-19T12:05:00.001Z')],
      { timeZone: TZ },
    )
    expect(flags(rows)).toEqual(['a:SE', 'b:SE'])
  })

  it('honours a custom gap', () => {
    const rows = groupRuns(
      [m('a', 'u1', '2026-10-19T12:00:00Z'), m('b', 'u1', '2026-10-19T12:00:30Z')],
      { gapMs: 10_000, timeZone: TZ },
    )
    expect(flags(rows)).toEqual(['a:SE', 'b:SE'])
  })

  it('breaks when the author changes', () => {
    const rows = groupRuns(
      [
        m('a', 'u1', '2026-10-19T12:00:00Z'),
        m('b', 'u2', '2026-10-19T12:00:10Z'),
        m('c', 'u2', '2026-10-19T12:00:20Z'),
      ],
      { timeZone: TZ },
    )
    expect(flags(rows)).toEqual(['a:SE', 'b:S-', 'c:-E'])
  })

  it('breaks at local midnight even within the gap', () => {
    const rows = groupRuns(
      [
        m('a', 'u1', '2026-10-19T03:59:00Z'), // 23:59 NY
        m('b', 'u1', '2026-10-19T04:00:00Z'), // 00:00 NY
      ],
      { timeZone: TZ },
    )
    expect(flags(rows)).toEqual(['a:SE', 'b:SE'])
  })

  it('does not break at UTC midnight when the local day is the same', () => {
    const rows = groupRuns(
      [m('a', 'u1', '2026-10-19T23:59:00Z'), m('b', 'u1', '2026-10-20T00:01:00Z')],
      { timeZone: TZ },
    )
    expect(flags(rows)).toEqual(['a:S-', 'b:-E'])
  })

  it('isolates a system message and breaks the run around it', () => {
    const rows = groupRuns(
      [
        m('a', 'u1', '2026-10-19T12:00:00Z'),
        m('sys', 'u1', '2026-10-19T12:00:10Z', 'system'),
        m('b', 'u1', '2026-10-19T12:00:20Z'),
      ],
      { timeZone: TZ },
    )
    expect(flags(rows)).toEqual(['a:SE', 'sys:SE', 'b:SE'])
  })

  it('keeps consecutive system messages separate', () => {
    const rows = groupRuns(
      [
        m('s1', 'u1', '2026-10-19T12:00:00Z', 'system'),
        m('s2', 'u1', '2026-10-19T12:00:00Z', 'system'),
      ],
      { timeZone: TZ },
    )
    expect(flags(rows)).toEqual(['s1:SE', 's2:SE'])
  })

  it('returns the original message objects', () => {
    const a = m('a', 'u1', '2026-10-19T12:00:00Z')
    expect(groupRuns([a])[0].message).toBe(a)
  })
})
