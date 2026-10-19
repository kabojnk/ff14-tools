import { describe, expect, it } from 'vitest'
import { parseMarkdown } from '@/lib/markdown'

describe('parseMarkdown', () => {
  it('returns plain text as a single text segment', () => {
    expect(parseMarkdown('hello')).toEqual([{ type: 'text', content: 'hello' }])
  })

  it('parses bold and italic with surrounding text', () => {
    expect(parseMarkdown('**bold** and *it*')).toEqual([
      { type: 'bold', content: 'bold' },
      { type: 'text', content: ' and ' },
      { type: 'italic', content: 'it' },
    ])
  })

  it('treats double asterisks as bold, not italic', () => {
    expect(parseMarkdown('**x**')).toEqual([{ type: 'bold', content: 'x' }])
  })

  it('parses strikethrough, inline code and spoilers', () => {
    expect(parseMarkdown('~~gone~~ `x = 1` ||secret||')).toEqual([
      { type: 'strikethrough', content: 'gone' },
      { type: 'text', content: ' ' },
      { type: 'code', content: 'x = 1' },
      { type: 'text', content: ' ' },
      { type: 'spoiler', content: 'secret' },
    ])
  })

  it('parses adjacent markers independently', () => {
    expect(parseMarkdown('**a** **b**')).toEqual([
      { type: 'bold', content: 'a' },
      { type: 'text', content: ' ' },
      { type: 'bold', content: 'b' },
    ])
  })

  it('splits lines with newline segments', () => {
    expect(parseMarkdown('a\nb')).toEqual([
      { type: 'text', content: 'a' },
      { type: 'newline', content: '\n' },
      { type: 'text', content: 'b' },
    ])
  })

  it('parses quote lines', () => {
    expect(parseMarkdown('> quoted\nnext')).toEqual([
      { type: 'quote', content: 'quoted' },
      { type: 'newline', content: '\n' },
      { type: 'text', content: 'next' },
    ])
  })

  it('parses fenced code blocks with a language', () => {
    expect(parseMarkdown('```ts\nconst a = 1\n```')).toEqual([
      { type: 'codeblock', content: 'const a = 1\n', language: 'ts' },
    ])
  })

  it('parses fenced code blocks without a language between text', () => {
    expect(parseMarkdown('before ```\ncode\n``` after')).toEqual([
      { type: 'text', content: 'before ' },
      { type: 'codeblock', content: 'code\n', language: undefined },
      { type: 'text', content: ' after' },
    ])
  })
})
