import { describe, expect, it } from 'vitest'
import { SPACES, SPACE_LABEL, isUnread, normalizeExtension, spaceKey } from '@/lib/spaces'

describe('spaces', () => {
  it('has exactly Main and Schist', () => {
    expect(SPACES).toEqual(['main', 'schist'])
    expect(SPACE_LABEL).toEqual({ main: 'Main', schist: 'Schist' })
  })

  it('spaceKey joins conversation and space', () => {
    expect(spaceKey('c1', 'schist')).toBe('c1:schist')
  })
})

describe('normalizeExtension', () => {
  it.each([
    ['.ZIP', 'zip'],
    ['zip', 'zip'],
    [' .zip ', 'zip'],
    ['..zip', 'zip'],
    ['ZIP', 'zip'],
    ['.tar.gz', 'tar.gz'],
  ])('%j → %j', (input, expected) => {
    expect(normalizeExtension(input)).toBe(expected)
  })

  it.each(['', '   ', '.', '...', null, undefined])('blank %j → null', (input) => {
    expect(normalizeExtension(input)).toBeNull()
  })
})

describe('isUnread', () => {
  const base = { latestAt: '2026-10-19T10:00:00Z', latestAuthorId: 'bea', lastReadAt: null, myId: 'alice' }

  it('is false with no latest message', () => {
    expect(isUnread({ ...base, latestAt: null, latestAuthorId: null })).toBe(false)
  })

  it('is true with no read position when the latest is someone else’s', () => {
    expect(isUnread(base)).toBe(true)
  })

  it('is false with no read position when the latest is mine', () => {
    expect(isUnread({ ...base, latestAuthorId: 'alice' })).toBe(false)
  })

  it('is false when the read position equals the latest', () => {
    expect(isUnread({ ...base, lastReadAt: '2026-10-19T10:00:00Z' })).toBe(false)
  })

  it('compares instants, not strings', () => {
    expect(isUnread({ ...base, lastReadAt: '2026-10-19T10:00:00.000+00:00' })).toBe(false)
  })

  it('is true when the latest is newer than the read position', () => {
    expect(isUnread({ ...base, lastReadAt: '2026-10-19T09:59:59Z' })).toBe(true)
  })

  it('is false when the newer latest message is mine', () => {
    expect(isUnread({ ...base, latestAuthorId: 'alice', lastReadAt: '2026-10-19T09:00:00Z' })).toBe(false)
  })
})
