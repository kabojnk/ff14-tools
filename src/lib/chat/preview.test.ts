import { describe, expect, it } from 'vitest'
import { listTimeLabel, messagePreview } from '@/lib/chat/preview'
import type { Attachment } from '@/types'

const att = (type: Attachment['type']): Attachment => ({ url: `https://x/${type}`, type, filename: 'f', size: 1, spoiler: false })

describe('messagePreview', () => {
  it('uses the first line of the text, trimmed', () => {
    expect(messagePreview({ content: '  bringing snacks 🍪\nsecond line', attachments: [], type: 'text' })).toBe('bringing snacks 🍪')
  })

  it('collapses inner whitespace', () => {
    expect(messagePreview({ content: 'a   b\tc', attachments: [], type: 'text' })).toBe('a b c')
  })

  it.each([
    ['image', 'Photo'],
    ['video', 'Video'],
    ['gif', 'GIF'],
    ['audio', 'Voice message'],
    ['file', 'File'],
  ] as const)('names a %s attachment when there is no text', (type, label) => {
    expect(messagePreview({ content: null, attachments: [att(type)], type: 'text' })).toBe(label)
  })

  it('a GIF message without attachments reads GIF', () => {
    expect(messagePreview({ content: '', attachments: [], type: 'gif' })).toBe('GIF')
  })

  it('falls back to "Message" for an empty message', () => {
    expect(messagePreview({ content: '   ', attachments: [], type: 'text' })).toBe('Message')
  })

  it('tolerates a missing attachments array', () => {
    expect(messagePreview({ content: null, attachments: null as unknown as Attachment[], type: 'text' })).toBe('Message')
  })
})

describe('listTimeLabel', () => {
  const now = new Date(2026, 9, 19, 15, 0) // Mon 19 Oct 2026, 15:00 local
  const opts = { locale: 'en-GB' }

  it('shows the time for today', () => {
    expect(listTimeLabel(new Date(2026, 9, 19, 9, 14), now, opts)).toBe('9:14')
  })

  it('shows Yesterday', () => {
    expect(listTimeLabel(new Date(2026, 9, 18, 23, 0), now, opts)).toBe('Yesterday')
  })

  it('shows the short weekday within the week', () => {
    expect(listTimeLabel(new Date(2026, 9, 15, 12, 0), now, opts)).toBe('Thu')
  })

  it('shows the short date for older messages', () => {
    expect(listTimeLabel(new Date(2026, 8, 1, 12, 0), now, { locale: 'en-US' })).toBe('Sep 1')
  })

  it('adds the year for another year', () => {
    expect(listTimeLabel(new Date(2025, 8, 1, 12, 0), now, { locale: 'en-US' })).toBe('Sep 1, 2025')
  })

  it('accepts ISO strings', () => {
    expect(listTimeLabel(new Date(2026, 9, 19, 9, 14).toISOString(), now, opts)).toBe('9:14')
  })
})
