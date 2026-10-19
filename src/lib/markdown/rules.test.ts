import { describe, expect, it } from 'vitest'
import { parseMarkdown, safeHref, type MdNode } from '@/lib/markdown/rules'

/** Strips nodes down to type + the fields a case cares about, so assertions stay readable. */
function shape(nodes: MdNode[]): unknown[] {
  return nodes.map((n) => {
    switch (n.type) {
      case 'text':
        return n.content
      case 'br':
        return 'br'
      case 'inlineCode':
        return { inlineCode: n.content }
      case 'codeBlock':
        return { codeBlock: n.content, lang: n.lang }
      case 'emoji':
        return { emoji: n.name }
      case 'link':
        return { link: n.target, masked: n.masked, content: shape(n.content) }
      case 'heading':
        return { [`h${n.level}`]: shape(n.content) }
      case 'list':
        return { [n.ordered ? 'ol' : 'ul']: n.items.map(shape), ...(n.start != null ? { start: n.start } : {}) }
      default:
        return { [n.type]: shape(n.content) }
    }
  })
}

const p = (s: string) => shape(parseMarkdown(s))

describe('parseMarkdown: characterisation (ported from the old parser)', () => {
  it('plain text', () => {
    expect(p('hello')).toEqual(['hello'])
  })
  it('bold and italic with surrounding text', () => {
    expect(p('**bold** and *it*')).toEqual([{ strong: ['bold'] }, ' and ', { em: ['it'] }])
  })
  it('double asterisks are bold, not italic', () => {
    expect(p('**x**')).toEqual([{ strong: ['x'] }])
  })
  it('strikethrough, inline code and spoilers', () => {
    expect(p('~~gone~~ `x = 1` ||secret||')).toEqual([
      { del: ['gone'] },
      ' ',
      { inlineCode: 'x = 1' },
      ' ',
      { spoiler: ['secret'] },
    ])
  })
  it('adjacent markers parse independently', () => {
    expect(p('**a** **b**')).toEqual([{ strong: ['a'] }, ' ', { strong: ['b'] }])
  })
  it('a single newline is a line break', () => {
    expect(p('a\nb')).toEqual(['a', 'br', 'b'])
  })
  it('a quote line, then a normal line', () => {
    expect(p('> quoted\nnext')).toEqual([{ blockQuote: ['quoted'] }, 'next'])
  })
  it('fenced code with a language', () => {
    expect(p('```ts\nconst a = 1\n```')).toEqual([{ codeBlock: 'const a = 1', lang: 'ts' }])
  })
  it('fenced code without a language, between text', () => {
    expect(p('before ```\ncode\n``` after')).toEqual(['before ', { codeBlock: 'code', lang: undefined }, ' after'])
  })
})

describe('parseMarkdown: Discord rules', () => {
  it('nests ***__x__***', () => {
    expect(p('***__x__***')).toEqual([{ em: [{ strong: [{ u: ['x'] }] }] }])
  })
  it('_x_ is italic and __x__ is underline', () => {
    expect(p('_a_ __b__')).toEqual([{ em: ['a'] }, ' ', { u: ['b'] }])
  })

  it('>>> quotes to the end of the message', () => {
    expect(p('>>> one\ntwo\nthree')).toEqual([{ blockQuote: ['one', 'br', 'two', 'br', 'three'] }])
  })
  it('> quotes only its own line', () => {
    expect(p('> one\ntwo')).toEqual([{ blockQuote: ['one'] }, 'two'])
  })
  it('> is not a quote mid-line', () => {
    expect(p('a > b')).toEqual(['a > b'])
  })
  it('consecutive > lines form one quote', () => {
    expect(p('> a\n> b')).toEqual([{ blockQuote: ['a', 'br', 'b'] }])
  })
  it('quotes do not nest', () => {
    expect(p('> > x')).toEqual([{ blockQuote: ['> x'] }])
  })

  it('bulleted lists', () => {
    expect(p('- a\n* b')).toEqual([{ ul: [['a'], ['b']] }])
  })
  it('numbered lists keep their start', () => {
    expect(p('3. a\n4. b')).toEqual([{ ol: [['a'], ['b']], start: 3 }])
  })
  it('nested lists by indentation', () => {
    expect(p('- a\n  - b\n  - c\n- d')).toEqual([{ ul: [['a', { ul: [['b'], ['c']] }], ['d']] }])
  })
  it('switching bullets and numbers starts a new list', () => {
    expect(p('- a\n1. b')).toEqual([{ ul: [['a']] }, { ol: [['b']], start: 1 }])
  })
  it('a list ends at the first non-item line', () => {
    expect(p('- a\nafter')).toEqual([{ ul: [['a']] }, 'after'])
  })
  it('a list needs the line start', () => {
    expect(p('x - a')).toEqual(['x - a'])
  })
  it('*italic* at the line start is not a list', () => {
    expect(p('*a*')).toEqual([{ em: ['a'] }])
  })

  it('headings # ## ### at the line start', () => {
    expect(p('# one\n## two\n### three')).toEqual([{ h1: ['one'] }, { h2: ['two'] }, { h3: ['three'] }])
  })
  it('# mid-line, #### and #tag are not headings', () => {
    expect(p('a # b')).toEqual(['a # b'])
    expect(parseMarkdown('#### x').some((n) => n.type === 'heading')).toBe(false)
    expect(parseMarkdown('#tag').some((n) => n.type === 'heading')).toBe(false)
  })
  it('a heading on the second line', () => {
    expect(p('hi\n# big')).toEqual(['hi', 'br', { h1: ['big'] }])
  })
  it('-# subtext', () => {
    expect(p('-# small print\nnext')).toEqual([{ subtext: ['small print'] }, 'next'])
  })
  it('no headings inside bold', () => {
    expect(parseMarkdown('**# x**')[0]).toMatchObject({ type: 'strong' })
    expect(JSON.stringify(parseMarkdown('**# x**'))).not.toContain('heading')
  })

  it('masked links', () => {
    expect(p('[site](https://example.com)')).toEqual([
      { link: 'https://example.com', masked: true, content: ['site'] },
    ])
  })
  it('masked links keep parentheses in the URL', () => {
    expect(p('[w](https://en.wikipedia.org/wiki/Foo_(bar))')).toEqual([
      { link: 'https://en.wikipedia.org/wiki/Foo_(bar)', masked: true, content: ['w'] },
    ])
  })
  it('unclosed link brackets stay fast', () => {
    const t = performance.now()
    parseMarkdown('[a]('.repeat(1000))
    expect(performance.now() - t).toBeLessThan(250)
  })
  it('bare urls autolink', () => {
    expect(p('go https://example.com/x now')).toEqual([
      'go ',
      { link: 'https://example.com/x', masked: false, content: ['https://example.com/x'] },
      ' now',
    ])
  })

  it(':name: is a custom emoji', () => {
    expect(p('hi :moogle:')).toEqual(['hi ', { emoji: 'moogle' }])
  })

  it('raw html stays text', () => {
    expect(p('<img src=x onerror=alert(1)>')).toEqual(['<img src=x onerror=alert(1)>'])
  })
  it('images, tables and setext headings are not parsed', () => {
    const all = JSON.stringify(parseMarkdown('![a](https://x/y.png)\n\na | b\n--|--\n1 | 2\n\nTitle\n====='))
    expect(all).not.toMatch(/"type":"(image|table|heading|paragraph)"/)
  })
  it('backslash escapes', () => {
    expect(p('\\*not\\*')).toEqual(['*not*'])
  })

  it('memoises per content string', () => {
    expect(parseMarkdown('**same**')).toBe(parseMarkdown('**same**'))
  })
  it('never throws on pathological input', () => {
    const nasty = '*'.repeat(500) + '_'.repeat(500) + '`'.repeat(300) + '['.repeat(300) + '>'.repeat(50)
    expect(() => parseMarkdown(nasty)).not.toThrow()
    expect(() => parseMarkdown('- '.repeat(200))).not.toThrow()
  })
})

describe('safeHref', () => {
  it('allows http, https and mailto', () => {
    expect(safeHref('https://a.b/c')).toBe('https://a.b/c')
    expect(safeHref('http://a.b')).toBe('http://a.b/')
    expect(safeHref('mailto:a@b.c')).toBe('mailto:a@b.c')
  })
  it('rejects everything else', () => {
    expect(safeHref('javascript:alert(1)')).toBeNull()
    expect(safeHref('JaVaScRiPt:alert(1)')).toBeNull()
    expect(safeHref('data:text/html,x')).toBeNull()
    expect(safeHref('/relative')).toBeNull()
    expect(safeHref('ftp://x')).toBeNull()
  })
})
