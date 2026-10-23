import { describe, expect, it } from 'vitest'
import { createSerialQueue, formatDuration, formatItemDate, groupByMonth, linkLabel } from '@/lib/gallery'

const at = (iso: string) => ({ created_at: iso })

describe('groupByMonth', () => {
  const now = new Date(2026, 9, 20, 12)

  it('groups newest-first items by month, naming the year only outside the current one', () => {
    const items = [
      at(new Date(2026, 9, 19).toISOString()),
      at(new Date(2026, 9, 2).toISOString()),
      at(new Date(2026, 8, 28).toISOString()),
      at(new Date(2025, 8, 3).toISOString()),
    ]
    const groups = groupByMonth(items, now)
    expect(groups.map((g) => g.label)).toEqual(['October', 'September', 'September 2025'])
    expect(groups.map((g) => g.items.length)).toEqual([2, 1, 1])
    expect(groups[0].items[0]).toBe(items[0])
  })

  it('returns nothing for no items', () => {
    expect(groupByMonth([], now)).toEqual([])
  })
})

describe('linkLabel', () => {
  it('shows the site large and the address small, without www.', () => {
    expect(linkLabel('https://www.example.com/guide')).toEqual({ site: 'example.com', address: 'example.com/guide' })
  })

  it('keeps the query and drops a bare trailing slash', () => {
    expect(linkLabel('https://youtube.com/watch?v=abc')).toEqual({ site: 'youtube.com', address: 'youtube.com/watch?v=abc' })
    expect(linkLabel('https://example.com/')).toEqual({ site: 'example.com', address: 'example.com' })
  })

  it('uses the text itself when the URL does not parse', () => {
    expect(linkLabel('not a url')).toEqual({ site: 'not a url', address: '' })
  })
})

describe('formatDuration', () => {
  it.each([
    [42, '0:42'],
    [65, '1:05'],
    [3723, '1:02:03'],
    [59.6, '1:00'],
    [0, '0:00'],
  ])('%s seconds reads %s', (s, out) => {
    expect(formatDuration(s)).toBe(out)
  })
})

describe('formatItemDate', () => {
  const now = new Date(2026, 9, 20, 12)

  it('shows the time for today', () => {
    expect(formatItemDate(new Date(2026, 9, 20, 9, 14).toISOString(), now)).toMatch(/9:14/)
  })

  it('shows day and month this year, and the year before that', () => {
    const thisYear = formatItemDate(new Date(2026, 8, 11).toISOString(), now)
    expect(thisYear).toMatch(/11/)
    expect(thisYear).toMatch(/Sep/)
    expect(thisYear).not.toMatch(/2026/)
    expect(formatItemDate(new Date(2025, 8, 11).toISOString(), now)).toMatch(/2025/)
  })
})

describe('createSerialQueue', () => {
  it('starts one job at a time, in order, and moves on when a job is done', () => {
    const q = createSerialQueue()
    const started: string[] = []
    const a = {}, b = {}, c = {}
    q.request(a, () => started.push('a'))
    q.request(b, () => started.push('b'))
    q.request(c, () => started.push('c'))
    expect(started).toEqual(['a'])
    q.done(a)
    expect(started).toEqual(['a', 'b'])
    q.cancel(c)
    q.done(b)
    expect(started).toEqual(['a', 'b'])
  })

  it('cancelling the running job frees the slot; done for another job is ignored', () => {
    const q = createSerialQueue()
    const started: string[] = []
    const a = {}, b = {}
    q.request(a, () => started.push('a'))
    q.request(b, () => started.push('b'))
    q.done(b)
    expect(started).toEqual(['a'])
    q.cancel(a)
    expect(started).toEqual(['a', 'b'])
  })

  it('a repeated request for a waiting or running job is ignored', () => {
    const q = createSerialQueue()
    const started: string[] = []
    const a = {}
    q.request(a, () => started.push('a'))
    q.request(a, () => started.push('a again'))
    expect(started).toEqual(['a'])
  })
})
