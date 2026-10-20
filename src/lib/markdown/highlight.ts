/**
 * Lazy code highlighting. highlight.js core and each language load on first
 * use, so none of it is in the main bundle. The import map is explicit because
 * Vite can't resolve a template-string `import()`.
 */
import type { HLJSApi, LanguageFn } from 'highlight.js'

type LanguageModule = { default: LanguageFn }

const LOADERS: Record<string, () => Promise<LanguageModule>> = {
  javascript: () => import('highlight.js/lib/languages/javascript'),
  typescript: () => import('highlight.js/lib/languages/typescript'),
  json: () => import('highlight.js/lib/languages/json'),
  css: () => import('highlight.js/lib/languages/css'),
  xml: () => import('highlight.js/lib/languages/xml'),
  bash: () => import('highlight.js/lib/languages/bash'),
  python: () => import('highlight.js/lib/languages/python'),
  sql: () => import('highlight.js/lib/languages/sql'),
  yaml: () => import('highlight.js/lib/languages/yaml'),
  markdown: () => import('highlight.js/lib/languages/markdown'),
}

const ALIASES: Record<string, string> = {
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  html: 'xml',
  svg: 'xml',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  py: 'python',
  yml: 'yaml',
  md: 'markdown',
}

const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k)

/** The highlight.js language for a fence label, or null when unsupported. */
export function languageFor(lang: string | undefined): string | null {
  if (!lang) return null
  const key = lang.toLowerCase()
  const name = has(ALIASES, key) ? ALIASES[key] : key
  return has(LOADERS, name) ? name : null
}

let core: Promise<HLJSApi> | null = null
const loadCore = () =>
  (core ??= import('highlight.js/lib/core').then(
    (m) => m.default,
    (err: unknown) => {
      core = null
      throw err
    },
  ))
const registering = new Map<string, Promise<void>>()

async function ensureLanguage(hljs: HLJSApi, name: string): Promise<void> {
  if (hljs.getLanguage(name)) return
  let pending = registering.get(name)
  if (!pending) {
    pending = LOADERS[name]().then(
      (m) => hljs.registerLanguage(name, m.default),
      (err: unknown) => {
        registering.delete(name) // let a later block retry a failed chunk load
        throw err
      },
    )
    registering.set(name, pending)
  }
  await pending
}

const CACHE_LIMIT = 200
const cache = new Map<string, string | null>()
const cacheKey = (code: string, lang: string | undefined) => `${lang ?? ''}\u0000${code}`

/** A previous result for this code and language, or undefined if not highlighted yet. */
export function cachedHighlight(code: string, lang: string | undefined): string | null | undefined {
  return cache.get(cacheKey(code, lang))
}

/**
 * Highlighted HTML for `code`, or null for an unknown language or any failure.
 * The HTML is highlight.js's own output: every piece of source text in it is
 * HTML-escaped, and the only markup is `<span class="hljs-…">`.
 */
export async function highlight(code: string, lang: string | undefined): Promise<string | null> {
  const key = cacheKey(code, lang)
  if (cache.has(key)) return cache.get(key)!
  const name = languageFor(lang)
  let html: string | null = null
  if (name) {
    try {
      const hljs = await loadCore()
      await ensureLanguage(hljs, name)
      html = hljs.highlight(code, { language: name, ignoreIllegals: true }).value
    } catch {
      // A failed chunk load isn't cached, so a later render can retry.
      return null
    }
  }
  cache.set(key, html)
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string)
  return html
}
