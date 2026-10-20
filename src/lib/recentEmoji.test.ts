import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_RECENT, noteRecentEmoji, recentEmoji, recentEmojiList } from '@/lib/recentEmoji'

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

  it('takes a count, topping up with the defaults', () => {
    noteRecentEmoji('🍪')
    expect(recentEmoji(3)).toEqual(['🍪', ...DEFAULT_RECENT.slice(0, 2)])
    expect(recentEmoji(10)).toEqual(['🍪', ...DEFAULT_RECENT])
  })

  it('survives blocked or corrupt storage', () => {
    localStorage.setItem('recentEmoji', '{nope')
    expect(recentEmoji()).toEqual(DEFAULT_RECENT)
    expect(recentEmojiList()).toEqual([])
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => noteRecentEmoji('🍪')).not.toThrow()
    expect(recentEmoji()).toEqual(DEFAULT_RECENT)
    expect(recentEmojiList()).toEqual([])
  })
})

describe('recentEmojiList', () => {
  it('is empty before anything is picked (no defaults)', () => {
    expect(recentEmojiList()).toEqual([])
  })

  it('returns only real picks, latest first, custom ones as :name:', () => {
    noteRecentEmoji('🍪')
    noteRecentEmoji(':moogle:')
    expect(recentEmojiList()).toEqual([':moogle:', '🍪'])
  })

  it('keeps up to 24 picks', () => {
    for (let i = 0; i < 30; i++) noteRecentEmoji(`:e${i}:`)
    const list = recentEmojiList()
    expect(list).toHaveLength(24)
    expect(list[0]).toBe(':e29:')
    expect(list[23]).toBe(':e6:')
    expect(recentEmoji()).toEqual([':e29:', ':e28:', ':e27:', ':e26:', ':e25:', ':e24:'])
  })
})
