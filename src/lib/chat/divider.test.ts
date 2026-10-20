import { describe, expect, it } from 'vitest'
import { firstUnreadIndex } from '@/lib/chat/divider'

type M = {
  author_id: string
  created_at: string
  type?: 'text' | 'gif' | 'system'
}
const m = (author_id: string, created_at: string, extra: Partial<M> = {}): M => ({
  author_id,
  created_at,
  ...extra,
})

const msgs: M[] = [
  m('bea', '2026-10-19T12:00:00Z'),
  m('me', '2026-10-19T12:01:00Z'),
  m('bea', '2026-10-19T12:02:00Z'),
  m('bea', '2026-10-19T12:03:00Z'),
]

describe('firstUnreadIndex', () => {
  it('finds the first message from someone else newer than my read time', () => {
    expect(firstUnreadIndex(msgs, '2026-10-19T12:00:30Z', 'me')).toBe(2)
  })

  it('skips my own messages', () => {
    expect(firstUnreadIndex(msgs, '2026-10-19T11:00:00Z', 'me')).toBe(0)
    expect(firstUnreadIndex(msgs.slice(1), '2026-10-19T12:00:30Z', 'me')).toBe(1)
  })

  it('treats a message at exactly my read time as read', () => {
    expect(firstUnreadIndex(msgs, '2026-10-19T12:02:00Z', 'me')).toBe(3)
  })

  it('treats identical timestamps after my read time as unread from the first one', () => {
    const list = [m('bea', '2026-10-19T12:05:00Z'), m('bea', '2026-10-19T12:05:00Z')]
    expect(firstUnreadIndex(list, '2026-10-19T12:04:00Z', 'me')).toBe(0)
  })

  it('returns -1 when everything is read', () => {
    expect(firstUnreadIndex(msgs, '2026-10-19T12:03:00Z', 'me')).toBe(-1)
  })

  it('returns -1 for an empty list', () => {
    expect(firstUnreadIndex([], null, 'me')).toBe(-1)
  })

  it('treats no read position as everything unread', () => {
    expect(firstUnreadIndex(msgs, null, 'me')).toBe(0)
  })

  it('skips system messages', () => {
    const list = [m('bea', '2026-10-19T12:05:00Z', { type: 'system' }), m('bea', '2026-10-19T12:06:00Z')]
    expect(firstUnreadIndex(list, '2026-10-19T12:00:00Z', 'me')).toBe(1)
  })

  it('compares parsed times, not strings', () => {
    expect(firstUnreadIndex(msgs, '2026-10-19T08:02:30-04:00', 'me')).toBe(3)
  })
})
