import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  DISGUISE_BAR, LOADING_BG, THEMES, THEME_TOKENS, defaultTheme, isThemeId, statusBarColor,
} from '@/lib/themes'

// Read from disk: Vitest doesn't process CSS, so a ?raw import comes back empty.
const css = readFileSync(`${process.cwd()}/src/styles/themes.css`, 'utf8')

// ---- WCAG 2.1 relative luminance -------------------------------------------------------------

type Rgb = [number, number, number]

/** Parses a plain hex or opaque rgb() colour. Anything else throws, so a tested token can't slip through. */
function parseColor(value: string): Rgb {
  const v = value.trim().toLowerCase()
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(v)
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].split('').map((c) => c + c).join('') : hex[1]
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb
  }
  const rgb = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/.exec(v)
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]
  throw new Error(`not a plain hex or opaque rgb() colour: ${value}`)
}

function luminance([r, g, b]: Rgb): number {
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

function contrast(a: string, b: string): number {
  const la = luminance(parseColor(a))
  const lb = luminance(parseColor(b))
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

// ---- themes.css parsing ----------------------------------------------------------------------

/** Every `[data-theme="id"]` block's custom properties, keyed by theme id. */
function parseThemes(source: string): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {}
  const stripped = source.replace(/\/\*[\s\S]*?\*\//g, '')
  for (const block of stripped.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const ids = [...block[1].matchAll(/\[data-theme="([\w-]+)"\]/g)].map((m) => m[1])
    if (ids.length === 0) continue
    const tokens = Object.fromEntries(
      [...block[2].matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
    )
    for (const id of ids) out[id] = { ...out[id], ...tokens }
  }
  return out
}

const parsed = parseThemes(css)

const AA_TEXT: [string, string][] = [
  ['fg', 'wall'], ['fg', 'bar'], ['fg', 'them'],
  ['me-fg', 'me'],
  ['muted', 'bar'], ['muted', 'them'],
  ['me-muted', 'me'],
  ['on-accent', 'accent'],
  ['accent', 'them'], ['me-link', 'me'],
  ['on-danger', 'danger'],
  ['code-fg', 'code-bg'],
]

const AA_UI: [string, string][] = [
  ['accent', 'bar'],
  ['tick', 'me'],
  ['danger', 'bar'],
  ['code-keyword', 'code-bg'], ['code-string', 'code-bg'], ['code-number', 'code-bg'],
  ['code-title', 'code-bg'], ['code-comment', 'code-bg'],
]

describe('parseColor', () => {
  it('reads hex and opaque rgb()', () => {
    expect(parseColor('#fff')).toEqual([255, 255, 255])
    expect(parseColor('#00a884')).toEqual([0, 168, 132])
    expect(parseColor('rgb(1, 2, 3)')).toEqual([1, 2, 3])
  })

  it.each(['rgba(0,0,0,.4)', 'hsl(0 0% 0%)', 'var(--x)', 'color-mix(in srgb, red 50%, blue)', 'red'])(
    'refuses %s instead of skipping it',
    (v) => {
      expect(() => parseColor(v)).toThrow()
    },
  )
})

describe('theme list', () => {
  it('has the 11 themes in the agreed order', () => {
    expect(THEMES.map((t) => t.id)).toEqual([
      'light', 'dark', 'midnight', 'latte', 'mocha', 'sakura', 'dawn', 'rosepine', 'dracula', 'nord', 'tokyo',
    ])
  })

  it('has a token block in themes.css for every theme, and no others', () => {
    expect(Object.keys(parsed).sort()).toEqual(THEMES.map((t) => t.id).sort())
  })

  it('makes dark the :root default, so the first paint is themed', () => {
    expect(css).toMatch(/:root,\s*\[data-theme="dark"\]\s*\{/)
  })

  it("index.html's first-paint script knows the same ids", () => {
    const html = readFileSync(`${process.cwd()}/index.html`, 'utf8')
    const list = /var ids = \[([^\]]*)\]/.exec(html)?.[1] ?? ''
    expect([...list.matchAll(/'([\w-]+)'/g)].map((m) => m[1])).toEqual(THEMES.map((t) => t.id))
  })

  it.each(THEMES.map((t) => [t.id, t.swatches] as const))('%s swatches match its wall, me and accent tokens', (id, swatches) => {
    expect(swatches).toEqual([parsed[id].wall, parsed[id].me, parsed[id].accent])
  })

  it.each(THEMES.map((t) => t.id))('%s defines every token', (id) => {
    const missing = THEME_TOKENS.filter((tok) => !(tok in parsed[id]))
    expect(missing).toEqual([])
  })

  it('isThemeId accepts the 11 ids only', () => {
    for (const t of THEMES) expect(isThemeId(t.id)).toBe(true)
    for (const x of ['', 'Dark', 'solarized', null, undefined, 3]) expect(isThemeId(x)).toBe(false)
  })

  it('defaultTheme follows the OS', () => {
    expect(defaultTheme(true)).toBe('dark')
    expect(defaultTheme(false)).toBe('light')
  })
})

describe('contrast (WCAG 2.1)', () => {
  const cases = (pairs: [string, string][], min: number) =>
    THEMES.flatMap((t) => pairs.map(([fg, bg]) => [t.id, fg, bg, min] as const))

  it.each([...cases(AA_TEXT, 4.5), ...cases(AA_UI, 3)])('%s: %s on %s is at least %s:1', (id, fg, bg, min) => {
    const ratio = contrast(parsed[id][fg], parsed[id][bg])
    expect(ratio, `${id} ${fg} ${parsed[id][fg]} on ${bg} ${parsed[id][bg]} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(min)
  })
})

describe('statusBarColor', () => {
  const bar = '#123456'

  it('shows the disguise bar whenever the disguise is up, whatever the theme', () => {
    expect(statusBarColor({ initialized: true, signedIn: true, eepMode: true, bar })).toBe(DISGUISE_BAR)
    expect(statusBarColor({ initialized: true, signedIn: false, eepMode: false, bar })).toBe(DISGUISE_BAR)
    expect(statusBarColor({ initialized: false, signedIn: false, eepMode: true, bar })).toBe(DISGUISE_BAR)
  })

  it('uses the fixed loading colour before auth resolves', () => {
    expect(statusBarColor({ initialized: false, signedIn: false, eepMode: false, bar })).toBe(LOADING_BG)
  })

  it("follows the theme's bar in the chat", () => {
    expect(statusBarColor({ initialized: true, signedIn: true, eepMode: false, bar })).toBe(bar)
  })

  it('falls back to the disguise bar if the theme bar is unreadable', () => {
    expect(statusBarColor({ initialized: true, signedIn: true, eepMode: false, bar: '' })).toBe(DISGUISE_BAR)
  })
})
