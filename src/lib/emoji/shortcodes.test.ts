import { describe, expect, it } from 'vitest'
import {
  buildIndex,
  emojiForCode,
  finishedShortcodeAt,
  loadShortcodes,
  shortcodeQueryAt,
  suggestEmoji,
  suggestionText,
} from '@/lib/emoji/shortcodes'

const index = buildIndex(
  [
    { hexcode: '1F602', unicode: '😂' },
    { hexcode: '1F44D', unicode: '👍' },
    { hexcode: '1F604', unicode: '😄' },
    { hexcode: '1F60A', unicode: '😊' },
    { hexcode: '1F3B2', unicode: '🎲' },
  ],
  { '1F602': 'joy', '1F44D': ['+1', 'thumbsup'], '1F604': 'smile', '1F60A': 'blush', '1F3B2': 'game_die' },
)

describe('shortcodeQueryAt', () => {
  it('finds :query before the caret, from two characters on', () => {
    expect(shortcodeQueryAt(':j', 2)).toBeNull()
    expect(shortcodeQueryAt(':jo', 3)).toEqual({ start: 0, query: 'jo' })
    expect(shortcodeQueryAt('ha :Thumbs', 10)).toEqual({ start: 3, query: 'thumbs' })
    expect(shortcodeQueryAt('(:smi', 5)).toEqual({ start: 1, query: 'smi' })
  })

  it('ignores times, links, finished codes and text after the caret', () => {
    expect(shortcodeQueryAt('at 10:30', 8)).toBeNull()
    expect(shortcodeQueryAt('https://x', 9)).toBeNull()
    expect(shortcodeQueryAt(':joy: ', 6)).toBeNull()
    expect(shortcodeQueryAt(':joy and', 2)).toBeNull()
  })
})

describe('suggestEmoji', () => {
  it('puts names that start with the query first, custom ones before standard, shortest first', () => {
    const custom = { smile_cat: 'https://cdn/cat.png' }
    expect(suggestEmoji(index, custom, 'smi')).toEqual([
      { kind: 'custom', name: 'smile_cat', url: 'https://cdn/cat.png' },
      { kind: 'standard', emoji: '😄', code: 'smile' },
    ])
  })

  it('matches any of an emoji’s names, and names containing the query after the prefixes', () => {
    expect(suggestEmoji(index, {}, 'thumb')).toEqual([{ kind: 'standard', emoji: '👍', code: 'thumbsup' }])
    expect(suggestEmoji(index, {}, 'us').map(suggestionText)).toEqual(['😊'])
    expect(suggestEmoji(index, {}, 'die').map(suggestionText)).toEqual(['🎲'])
  })

  it('stops at the limit', () => {
    expect(suggestEmoji(index, {}, 'u')).toHaveLength(2)
    expect(suggestEmoji(index, {}, 'u', 1)).toHaveLength(1)
  })
})

describe('finished codes', () => {
  it('finds :code: right before the caret and converts known names', () => {
    expect(finishedShortcodeAt('lol :joy:', 9)).toEqual({ start: 4, code: 'joy' })
    expect(finishedShortcodeAt('10:30:', 6)).toBeNull()
    expect(emojiForCode(index, 'JOY')).toBe('😂')
    expect(emojiForCode(index, '+1')).toBe('👍')
    expect(emojiForCode(index, 'nope')).toBeNull()
  })

  it('writes custom emoji as :name:', () => {
    expect(suggestionText({ kind: 'custom', name: 'blob', url: 'u' })).toBe(':blob:')
  })
})

describe('loadShortcodes (real data)', () => {
  it('knows the usual Discord names', async () => {
    const real = await loadShortcodes()
    // emojibase's fully qualified forms (with the emoji variation selector), as the picker inserts them.
    const plain = (code: string) => emojiForCode(real, code)?.replace(/\uFE0F/g, '')
    expect(plain('joy')).toBe('😂')
    expect(plain('thumbsup')).toBe('👍')
    expect(plain('heart')).toBe('❤')
    expect(real.length).toBeGreaterThan(1500)
  })
})
