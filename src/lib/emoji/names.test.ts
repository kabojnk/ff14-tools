import { describe, expect, it } from 'vitest'
import { emojiNameError, normaliseEmojiName } from '@/lib/emoji/names'

describe('normaliseEmojiName', () => {
  it('lowercases and turns spaces and dashes into _', () => {
    expect(normaliseEmojiName('Moogle Wave')).toBe('moogle_wave')
    expect(normaliseEmojiName('happy-cat')).toBe('happy_cat')
  })

  it('strips surrounding colons from a paste', () => {
    expect(normaliseEmojiName(':Moogle Wave:')).toBe('moogle_wave')
    expect(normaliseEmojiName('::blob::')).toBe('blob')
  })

  it('drops anything outside a-z, 0-9 and _', () => {
    expect(normaliseEmojiName('kupo!?é★2')).toBe('kupo2')
    expect(normaliseEmojiName('a:b')).toBe('ab')
  })

  it('caps the name at 32 characters', () => {
    expect(normaliseEmojiName('a'.repeat(40))).toBe('a'.repeat(32))
  })

  it('keeps a trailing _ while typing', () => {
    expect(normaliseEmojiName('moogle ')).toBe('moogle_')
  })
})

describe('emojiNameError', () => {
  const taken = new Set(['moogle'])

  it('accepts a valid free name', () => {
    expect(emojiNameError('wipe_cry', taken)).toBeNull()
    expect(emojiNameError('ab', taken)).toBeNull()
    expect(emojiNameError('a'.repeat(32), taken)).toBeNull()
  })

  it('needs at least 2 characters', () => {
    expect(emojiNameError('', taken)).toBe('Use at least 2 characters.')
    expect(emojiNameError('a', taken)).toBe('Use at least 2 characters.')
  })

  it('rejects anything but lowercase letters, numbers and _', () => {
    expect(emojiNameError('Moogle', taken)).toBe('Use lowercase letters, numbers and _ only.')
    expect(emojiNameError('moo-gle', taken)).toBe('Use lowercase letters, numbers and _ only.')
    expect(emojiNameError('a'.repeat(33), taken)).toBe('Use lowercase letters, numbers and _ only.')
  })

  it('reports a taken name', () => {
    expect(emojiNameError('moogle', taken)).toBe(':moogle: is already taken.')
  })
})
