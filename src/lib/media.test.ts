import { describe, expect, it } from 'vitest'
import { formatSize, kindsFor, linkHost } from '@/lib/media'

describe('kindsFor', () => {
  it.each([
    ['all', ['image', 'video', 'gif']],
    ['photos', ['image']],
    ['videos', ['video']],
    ['gifs', ['gif']],
    ['files', ['file']],
    ['links', ['link']],
    ['voice', ['audio']],
  ] as const)('maps %s without an extension', (kind, kinds) => {
    expect(kindsFor(kind, null)).toEqual(kinds)
  })

  it('searches every kind when All has an extension', () => {
    expect(kindsFor('all', 'zip')).toBeNull()
  })

  it('keeps a specific kind when it has an extension', () => {
    expect(kindsFor('files', 'zip')).toEqual(['file'])
  })
})

describe('formatSize', () => {
  it('shows KB below a megabyte and MB above', () => {
    expect(formatSize(512)).toBe('0.5 KB')
    expect(formatSize(2048)).toBe('2 KB')
    expect(formatSize(1536 * 1024)).toBe('1.5 MB')
  })

  it('is empty for an unknown size', () => {
    expect(formatSize(null)).toBe('')
  })
})

describe('linkHost', () => {
  it('is the host of a URL', () => {
    expect(linkHost('https://example.com/guide')).toBe('example.com')
    expect(linkHost('http://sub.example.com:8080/a?b')).toBe('sub.example.com:8080')
  })

  it('falls back to the text when it is not a URL', () => {
    expect(linkHost('not a url')).toBe('not a url')
  })
})
