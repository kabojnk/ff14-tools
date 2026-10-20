import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_RECENT, noteRecentEmoji, recentEmoji } from '@/lib/recentEmoji'

beforeEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('recentEmoji', () => {
  it('starts from six defaults', () => {
    expect(recentEmoji()).toEqual(DEFAULT_RECENT)
    expect(DEFAULT_RECENT).toHaveLength(6)
  })

  it('puts the latest first, without duplicates, keeping six', () => {
    noteRecentEmoji('🍪')
    noteRecentEmoji(':blob:')
    noteRecentEmoji('🍪')
    const list = recentEmoji()
    expect(list.slice(0, 2)).toEqual(['🍪', ':blob:'])
    expect(list).toHaveLength(6)
    expect(new Set(list).size).toBe(6)
  })

  it('survives blocked or corrupt storage', () => {
    localStorage.setItem('recentEmoji', '{nope')
    expect(recentEmoji()).toEqual(DEFAULT_RECENT)
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => noteRecentEmoji('🍪')).not.toThrow()
    expect(recentEmoji()).toEqual(DEFAULT_RECENT)
  })
})
