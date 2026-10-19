import { describe, expect, it } from 'vitest'
import { cachedHighlight, highlight, languageFor } from '@/lib/markdown/highlight'

describe('languageFor', () => {
  it('maps aliases to highlight.js language names', () => {
    expect(languageFor('js')).toBe('javascript')
    expect(languageFor('TS')).toBe('typescript')
    expect(languageFor('html')).toBe('xml')
    expect(languageFor('sh')).toBe('bash')
    expect(languageFor('py')).toBe('python')
    expect(languageFor('yml')).toBe('yaml')
    expect(languageFor('md')).toBe('markdown')
    expect(languageFor('json')).toBe('json')
    expect(languageFor('css')).toBe('css')
    expect(languageFor('sql')).toBe('sql')
  })
  it('unknown or missing languages give null', () => {
    expect(languageFor('cobol')).toBeNull()
    expect(languageFor(undefined)).toBeNull()
    expect(languageFor('')).toBeNull()
    expect(languageFor('constructor')).toBeNull()
  })
})

describe('highlight', () => {
  it('returns escaped, classed HTML for a known language', async () => {
    const html = await highlight('const a = "<b>"', 'js')
    expect(html).toContain('hljs-keyword')
    expect(html).toContain('&lt;b&gt;')
    expect(html).not.toContain('<b>')
  })
  it('returns null for an unknown language', async () => {
    expect(await highlight('x', 'cobol')).toBeNull()
    expect(await highlight('x', undefined)).toBeNull()
  })
  it('caches results so a remount paints highlighted immediately', async () => {
    expect(cachedHighlight('select 1', 'sql')).toBeUndefined()
    const html = await highlight('select 1', 'sql')
    expect(cachedHighlight('select 1', 'sql')).toBe(html)
  })
})
