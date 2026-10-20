/**
 * Discord-flavoured markdown on top of simple-markdown.
 *
 * Everything is parsed in inline mode, the way Discord does it: the default
 * block rules (paragraph, setext heading, table, def…) return null there.
 * Headings, `-#` subtext, lists and quotes are re-implemented as inline rules
 * that only match at the start of a line (the previous capture ended with a
 * newline, or nothing has been captured yet), and never inside another
 * construct such as bold text or a list item.
 *
 * The parser only builds an AST. Rendering lives in components/chat2/Markdown.
 */
import SimpleMarkdown from '@khanacademy/simple-markdown'
import type { Capture, Parser, ParserRule, ParserRules, SingleASTNode, State } from '@khanacademy/simple-markdown'

type Inline = MdNode[]

export type MdNode =
  | { type: 'text'; content: string }
  | { type: 'br' }
  | { type: 'strong' | 'em' | 'u' | 'del' | 'spoiler' | 'blockQuote' | 'subtext'; content: Inline }
  | { type: 'heading'; level: 1 | 2 | 3; content: Inline }
  | { type: 'list'; ordered: boolean; start?: number; items: Inline[] }
  | { type: 'inlineCode'; content: string }
  | { type: 'codeBlock'; lang?: string; content: string }
  | { type: 'link'; target: string; masked: boolean; raw: string; content: Inline }
  | { type: 'emoji'; name: string }

const d = SimpleMarkdown.defaultRules

/** True at the start of a line, outside any other construct (bold, list item, heading…). */
function atLineStart(state: State): boolean {
  if (state.nested) return false
  const prev = state.prevCapture as Capture | null | undefined
  return prev == null || prev[0].endsWith('\n')
}

function lineStartRegex(regex: RegExp, extra?: (state: State) => boolean): ParserRule['match'] {
  return (source, state) => (atLineStart(state) && (!extra || extra(state)) ? regex.exec(source) : null)
}

/** Runs `fn` with `state[key] = true`, restoring the old value afterwards. */
function withFlag<T>(state: State, key: string, fn: () => T): T {
  const old = state[key]
  state[key] = true
  try {
    return fn()
  } finally {
    state[key] = old
  }
}

/** Wraps a rule's parse so its children can't start line-level constructs. */
function nestedRule(rule: ParserRule): ParserRule {
  return { ...rule, parse: (capture, parse, state) => withFlag(state, 'nested', () => rule.parse(capture, parse, state)) }
}

// Order numbers: lower wins; equal orders compare `quality`. Fence and the
// line-start rules come first so their markers aren't eaten as text or em.
const ORDER_FENCE = 0
const ORDER_QUOTE = 1
const ORDER_HEADING = 2
const ORDER_SUBTEXT = 3
const ORDER_LIST = 4

const FENCE_R = /^```(?:([a-z0-9_+\-.#]+?)\n)?\n*([^\n][\s\S]*?)\n*```\n?/i
const QUOTE_BLOCK_R = /^ *>>>[ \n]([\s\S]*)/
const QUOTE_LINES_R = /^ *> [^\n]*(?:\n *> [^\n]*)*\n?/
const HEADING_R = /^(#{1,3}) +([^\n]+?) *(?:\n|$)/
const SUBTEXT_R = /^-# +([^\n]+?) *(?:\n|$)/
const LIST_R = /^(?: *(?:[*-]|\d{1,9}\.) +[^\n]*(?:\n|$))+/
const LIST_LINE_R = /^( *)([*-]|\d{1,9}\.) +(.*)$/
// [text](url): one level of brackets in the text and of parentheses in the
// URL, no spaces in the URL. Replaces the default rule, whose nested lazy
// groups backtrack badly (seconds) on input like "[a](" repeated.
const MASKED_LINK_R = /^\[((?:\[[^[\]]*\]|[^[\]])*)\]\(\s*<?([^\s()<>]*(?:\([^\s()]*\)[^\s()<>]*)*)>?\s*\)/
// Text stops before any symbol, a newline, or something that looks like `scheme:` (for bare URLs).
const TEXT_R = /^[\s\S]+?(?=[^0-9A-Za-z\sÀ-￿]|\n|\w+:\S|$)/

interface ListLine {
  indent: number
  ordered: boolean
  start: number
  text: string
}

/**
 * Builds lists from item lines. Lines indented deeper than the current level
 * nest under the previous item; switching between bullets and numbers at the
 * same level starts a new list.
 */
function buildLists(lines: ListLine[], parse: Parser, state: State): MdNode[] {
  const lists: MdNode[] = []
  let items: Inline[] = []
  let first = lines[0]
  const flush = () => {
    if (!items.length) return
    lists.push(
      first.ordered
        ? { type: 'list', ordered: true, start: first.start, items }
        : { type: 'list', ordered: false, items },
    )
    items = []
  }
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.ordered !== first.ordered) {
      flush()
      first = line
    }
    const item: Inline = parse(line.text, state) as Inline
    i++
    const childStart = i
    while (i < lines.length && lines[i].indent > lines[0].indent) i++
    if (i > childStart) item.push(...buildLists(lines.slice(childStart, i), parse, state))
    items.push(item)
  }
  flush()
  return lists
}

const rules: ParserRules = {
  codeBlock: {
    order: ORDER_FENCE,
    match: (source) => FENCE_R.exec(source),
    parse: (capture) => ({ type: 'codeBlock', lang: capture[1] || undefined, content: capture[2] }),
  },
  blockQuote: {
    order: ORDER_QUOTE,
    match: lineStartRegex(new RegExp(`${QUOTE_BLOCK_R.source}|${QUOTE_LINES_R.source}`), (s) => !s.inQuote),
    parse: (capture, parse, state) => {
      const all = capture[0]
      const isBlock = /^ *>>>/.test(all)
      const body = isBlock ? all.replace(/^ *>>>[ \n]/, '') : all.replace(/^ *> /gm, '').replace(/\n$/, '')
      return { type: 'blockQuote', content: withFlag(state, 'inQuote', () => parse(body, state)) }
    },
  },
  heading: {
    order: ORDER_HEADING,
    match: lineStartRegex(HEADING_R),
    parse: (capture, parse, state) => ({
      type: 'heading',
      level: capture[1].length,
      content: withFlag(state, 'nested', () => parse(capture[2], state)),
    }),
  },
  subtext: {
    order: ORDER_SUBTEXT,
    match: lineStartRegex(SUBTEXT_R),
    parse: (capture, parse, state) => ({
      type: 'subtext',
      content: withFlag(state, 'nested', () => parse(capture[1], state)),
    }),
  },
  list: {
    order: ORDER_LIST,
    match: lineStartRegex(LIST_R),
    parse: (capture, parse, state) => {
      const lines: ListLine[] = capture[0]
        .replace(/\n$/, '')
        .split('\n')
        .map((raw) => {
          const m = LIST_LINE_R.exec(raw)!
          const ordered = m[2] !== '-' && m[2] !== '*'
          return { indent: m[1].length, ordered, start: ordered ? parseInt(m[2], 10) : 1, text: m[3] }
        })
      return withFlag(state, 'nested', () => buildLists(lines, parse, state))
    },
  },
  escape: d.escape,
  autolink: d.autolink,
  mailto: d.mailto,
  url: d.url,
  link: nestedRule({
    order: d.link.order,
    match: SimpleMarkdown.inlineRegex(MASKED_LINK_R),
    parse: (capture, parse, state) => ({
      type: 'link',
      content: parse(capture[1], state),
      target: SimpleMarkdown.unescapeUrl(capture[2]),
      masked: true,
      raw: capture[0],
    }),
  }),
  em: nestedRule(d.em),
  strong: nestedRule(d.strong),
  u: nestedRule(d.u),
  del: nestedRule(d.del),
  spoiler: nestedRule({
    order: d.del.order,
    match: SimpleMarkdown.inlineRegex(/^\|\|([\s\S]+?)\|\|/),
    parse: (capture, parse, state) => ({ type: 'spoiler', content: parse(capture[1], state) }),
  }),
  inlineCode: d.inlineCode,
  emoji: {
    order: d.inlineCode.order,
    match: SimpleMarkdown.inlineRegex(/^:([a-zA-Z0-9_]{2,32}):/),
    parse: (capture) => ({ type: 'emoji', name: capture[1] }),
  },
  br: {
    order: d.br.order,
    match: SimpleMarkdown.anyScopeRegex(/^\n/),
    parse: () => ({ type: 'br' }),
  },
  text: {
    ...d.text,
    match: SimpleMarkdown.anyScopeRegex(TEXT_R),
  },
}

const rawParse = SimpleMarkdown.parserFor(rules, { inline: true })

/** Merges adjacent text nodes and fills in `masked: false` for bare and <angle> links. */
function normalise(nodes: SingleASTNode[]): MdNode[] {
  const out: MdNode[] = []
  for (const n of nodes) {
    if (n.type === 'text') {
      const last = out[out.length - 1]
      if (last?.type === 'text') last.content += n.content
      else out.push({ type: 'text', content: n.content })
      continue
    }
    if (n.type === 'link') {
      out.push({ type: 'link', target: n.target, masked: n.masked === true, raw: n.raw ?? n.target, content: normalise(n.content) })
    } else if (n.type === 'list') {
      out.push({ ...(n as MdNode & { type: 'list' }), items: (n.items as SingleASTNode[][]).map(normalise) })
    } else if (Array.isArray(n.content)) {
      out.push({ ...(n as MdNode), content: normalise(n.content) } as MdNode)
    } else {
      out.push(n as MdNode)
    }
  }
  return out
}

const CACHE_LIMIT = 500
const cache = new Map<string, MdNode[]>()

/**
 * Parses a message into a Discord-flavoured AST. Results are memoised per
 * content string (small LRU) and must be treated as read-only. Any parser
 * error falls back to the whole message as plain text.
 */
export function parseMarkdown(source: string): MdNode[] {
  const hit = cache.get(source)
  if (hit) {
    // Refresh recency.
    cache.delete(source)
    cache.set(source, hit)
    return hit
  }
  let result: MdNode[]
  try {
    result = normalise(rawParse(source, { inline: true }))
  } catch {
    result = source ? [{ type: 'text', content: source }] : []
  }
  cache.set(source, result)
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string)
  return result
}

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

/** Returns a normalised href when it is an absolute http(s) or mailto URL, else null. */
export function safeHref(target: string): string | null {
  try {
    const url = new URL(target)
    return ALLOWED_PROTOCOLS.has(url.protocol) ? url.href : null
  } catch {
    return null
  }
}
