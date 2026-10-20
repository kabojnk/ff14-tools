import { beforeEach, describe, expect, it, vi } from 'vitest'

const imported = vi.hoisted(() => ({ count: 0 }))

vi.mock('emojibase-data/en/compact.json', () => {
  imported.count++
  return {
    default: [
      { label: 'grinning face', unicode: '😀', group: 0, order: 1, tags: ['face', 'grin'] },
      { label: 'crying face', unicode: '😢', group: 0, order: 60, tags: ['cry', 'sad', 'tear'] },
      { label: 'waving hand', unicode: '👋', group: 1, order: 200, tags: ['hand', 'wave'] },
      { label: 'light skin tone', unicode: '🏻', group: 2, order: 300 },
      { label: 'monkey face', unicode: '🐵', group: 3, order: 400, tags: ['monkey'] },
      { label: 'grapes', unicode: '🍇', group: 4, order: 500, tags: ['fruit', 'grape'] },
      { label: 'globe showing Europe-Africa', unicode: '🌍️', group: 5, order: 600, tags: ['earth', 'globe'] },
      { label: 'jack-o-lantern', unicode: '🎃', group: 6, order: 700, tags: ['halloween'] },
      { label: 'glasses', unicode: '👓️', group: 7, order: 800, tags: ['eyewear'] },
      { label: 'ATM sign', unicode: '🏧', group: 8, order: 900, tags: ['atm', 'bank'] },
      { label: 'chequered flag', unicode: '🏁', group: 9, order: 1000, tags: ['checkered', 'racing'] },
      { label: 'regional indicator A', unicode: '🇦' },
      { label: 'smiling cat', unicode: '😺', group: 0, order: 100, tags: ['cat', 'happy'] },
      { label: 'cat', unicode: '🐈️', group: 3, order: 410, tags: ['pet'] },
      { label: 'scatter', unicode: '🫠', group: 0, order: 50 },
    ],
  }
})

import { loadEmoji, searchEmoji, type StandardEmoji } from '@/lib/emoji/data'

let all: StandardEmoji[]
beforeEach(async () => {
  all = await loadEmoji()
})

describe('loadEmoji', () => {
  it('maps groups to tabs', () => {
    const tab = (e: string) => all.find((x) => x.emoji === e)?.tab
    expect(tab('😀')).toBe('smileys')
    expect(tab('👋')).toBe('smileys')
    expect(tab('🐵')).toBe('nature')
    expect(tab('🍇')).toBe('food')
    expect(tab('🌍️')).toBe('travel')
    expect(tab('🎃')).toBe('activities')
    expect(tab('👓️')).toBe('objects')
    expect(tab('🏧')).toBe('symbols')
    expect(tab('🏁')).toBe('flags')
  })

  it('drops the component group and entries without a group', () => {
    expect(all.find((e) => e.emoji === '🏻')).toBeUndefined()
    expect(all.find((e) => e.emoji === '🇦')).toBeUndefined()
    expect(all).toHaveLength(13)
  })

  it('keeps the dataset order and defaults missing tags to []', () => {
    expect(all.slice(0, 4).map((e) => e.emoji)).toEqual(['😀', '🫠', '😢', '😺'])
    expect(all.find((e) => e.emoji === '🫠')?.tags).toEqual([])
  })

  it('loads the dataset once for two calls', async () => {
    const [a, b] = await Promise.all([loadEmoji(), loadEmoji()])
    expect(a).toBe(b)
    expect(a).toBe(all)
    expect(imported.count).toBe(1)
  })
})

describe('searchEmoji', () => {
  const custom = [{ name: 'wipe_cry' }, { name: 'moogle' }, { name: 'catgirl' }]

  it('finds a tagged emoji and a custom name', () => {
    const r = searchEmoji(all, custom, 'cry')
    expect(r.standard.map((e) => e.emoji)).toEqual(['😢'])
    expect(r.custom).toEqual(['wipe_cry'])
  })

  it('returns nothing for an empty query', () => {
    expect(searchEmoji(all, custom, '')).toEqual({ standard: [], custom: [] })
    expect(searchEmoji(all, custom, '   ')).toEqual({ standard: [], custom: [] })
  })

  it('is case-insensitive and matches label words', () => {
    expect(searchEmoji(all, custom, 'MONKEY').standard.map((e) => e.emoji)).toEqual(['🐵'])
    expect(searchEmoji(all, custom, 'europe').standard.map((e) => e.emoji)).toEqual(['🌍️'])
  })

  it('puts prefix matches before inner matches', () => {
    const r = searchEmoji(all, custom, 'cat')
    // 'cat' starts a word or tag of 😺 and 🐈️; it is only inside 'scatter'
    expect(r.standard.map((e) => e.emoji)).toEqual(['😺', '🐈️', '🫠'])
    expect(r.custom).toEqual(['catgirl'])
  })

  it('ignores surrounding colons in the query', () => {
    expect(searchEmoji(all, custom, ':moog').custom).toEqual(['moogle'])
  })
})
