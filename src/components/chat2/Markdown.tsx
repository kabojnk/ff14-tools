import { createElement, useEffect, useMemo, useReducer, useRef, useState, type ReactNode, type SyntheticEvent } from 'react'
import { parseMarkdown, safeHref, type MdNode } from '@/lib/markdown/rules'
import { cachedHighlight, highlight } from '@/lib/markdown/highlight'
import '@/lib/markdown/code.css'

/** Resolves a custom emoji name (without colons) to its image URL, or undefined if unknown. */
export type EmojiLookup = (name: string) => string | undefined

export interface MarkdownProps {
  /** Raw message text. */
  content: string
  /** Custom emoji lookup for `:name:`; unknown names stay as text. */
  emoji?: EmojiLookup
  /** Called after a code block finishes highlighting (its height may have changed). */
  onHighlight?: () => void
  className?: string
}

interface Ctx {
  emoji?: EmojiLookup
  onHighlight: () => void
}

const INLINE_CODE =
  'rounded-[4px] bg-[var(--code-bg,#1e1e2e)] px-1 py-px font-mono text-[0.875em] text-[var(--code-fg,#cdd6f4)]'
const HEADING = ['', 'text-[1.5em] font-bold leading-tight', 'text-[1.25em] font-bold leading-tight', 'text-[1.1em] font-bold'] as const

/** Renders a node list with React.createElement (never the parser's own React output). */
function renderNodes(nodes: MdNode[], ctx: Ctx): ReactNode[] {
  return nodes.map((node, i) => renderNode(node, i, ctx))
}

function renderNode(node: MdNode, key: number, ctx: Ctx): ReactNode {
  switch (node.type) {
    case 'text':
      return node.content
    case 'br':
      return createElement('br', { key })
    case 'strong':
    case 'em':
    case 'u':
    case 'del':
      return createElement(node.type, { key }, renderNodes(node.content, ctx))
    case 'spoiler':
      return createElement(Spoiler, { key, children: renderNodes(node.content, ctx) })
    case 'inlineCode':
      return createElement('code', { key, className: INLINE_CODE }, node.content)
    case 'codeBlock':
      return createElement(CodeBlock, { key, code: node.content, lang: node.lang, onHighlight: ctx.onHighlight })
    case 'blockQuote':
      return createElement(
        'blockquote',
        { key, className: 'my-0.5 border-l-[3px] border-[var(--muted,#888)] pl-2.5' },
        renderNodes(node.content, ctx),
      )
    case 'heading':
      return createElement(`h${node.level}`, { key, className: `my-1 ${HEADING[node.level]}` }, renderNodes(node.content, ctx))
    case 'subtext':
      return createElement(
        'small',
        { key, className: 'block text-[0.8em] text-[var(--muted,#888)]' },
        renderNodes(node.content, ctx),
      )
    case 'list':
      return createElement(
        node.ordered ? 'ol' : 'ul',
        {
          key,
          start: node.ordered ? node.start : undefined,
          className: `my-0.5 pl-5 ${node.ordered ? 'list-decimal' : 'list-disc'}`,
        },
        node.items.map((item, i) => createElement('li', { key: i }, renderNodes(item, ctx))),
      )
    case 'link': {
      const href = safeHref(node.target)
      if (!href) return node.raw
      return createElement(
        'a',
        {
          key,
          href,
          title: node.masked ? href : undefined,
          target: '_blank',
          rel: 'noopener noreferrer',
          className: 'text-[var(--accent,#5865f2)] underline-offset-2 hover:underline',
        },
        renderNodes(node.content, ctx),
      )
    }
    case 'emoji': {
      const src = ctx.emoji?.(node.name)
      const label = `:${node.name}:`
      if (!src) return label
      return createElement('img', {
        key,
        src,
        alt: label,
        title: label,
        draggable: false,
        loading: 'lazy',
        className: 'inline-block h-[1.375em] w-auto align-[-0.3em] object-contain',
      })
    }
  }
}

/** Discord-flavoured markdown. Parsed output is memoised per content string. */
export default function Markdown({ content, emoji, onHighlight, className }: MarkdownProps) {
  const onHighlightRef = useRef(onHighlight)
  useEffect(() => {
    onHighlightRef.current = onHighlight
  })
  const nodes = useMemo(() => parseMarkdown(content), [content])
  const children = useMemo(
    () => renderNodes(nodes, { emoji, onHighlight: () => onHighlightRef.current?.() }),
    [nodes, emoji],
  )
  return createElement('div', { className: `whitespace-pre-wrap break-words ${className ?? ''}`.trim() }, children)
}

/** Hidden until clicked, tapped or activated from the keyboard; the reveal is per element and per viewer. */
function Spoiler({ children }: { children: ReactNode }) {
  const [revealed, setRevealed] = useState(false)
  if (revealed) {
    return (
      <span className="rounded-[3px] bg-[color-mix(in_srgb,var(--muted,#888)_22%,transparent)] px-0.5">{children}</span>
    )
  }
  const reveal = (e: SyntheticEvent) => {
    // Hidden content isn't interactive yet: don't follow links inside it or open message actions.
    e.preventDefault()
    e.stopPropagation()
    setRevealed(true)
  }
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label="Spoiler"
      aria-expanded={false}
      onClick={reveal}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') reveal(e)
      }}
      className="cursor-pointer select-none rounded-[3px] bg-[var(--muted,#6b7280)] px-0.5 text-transparent [&_*]:pointer-events-none [&_*]:text-transparent! [&_img]:invisible"
    >
      <span aria-hidden="true">{children}</span>
    </span>
  )
}

function CodeBlock({ code, lang, onHighlight }: { code: string; lang?: string; onHighlight: () => void }) {
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  const html = cachedHighlight(code, lang)

  useEffect(() => {
    if (cachedHighlight(code, lang) !== undefined) return
    let live = true
    void highlight(code, lang).then((result) => {
      if (!live || !result) return
      rerender()
      onHighlight()
    })
    return () => {
      live = false
    }
    // onHighlight is a stable trampoline over the latest callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, lang])

  return (
    <figure className="md-code group relative my-1 overflow-hidden rounded-lg text-[0.875em]">
      <figcaption className="flex min-h-7 items-center justify-between gap-2 px-3 pt-1 font-mono text-[0.8em] opacity-70">
        <span>{lang ?? ''}</span>
        <CopyButton code={code} />
      </figcaption>
      <pre className="overflow-x-auto px-3 pb-2.5 pt-0.5 whitespace-pre">
        {html ? (
          // Safe: `html` is highlight.js output for this code block only. highlight.js
          // HTML-escapes all source text and adds nothing but <span class="hljs-…">.
          <code className="font-mono" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <code className="font-mono">{code}</code>
        )}
      </pre>
    </figure>
  )
}

function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(t)
  }, [copied])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
    } catch {
      // Clipboard can be unavailable (permissions, insecure context); nothing else to do.
    }
  }

  return (
    <button
      type="button"
      aria-label={copied ? 'Copied' : 'Copy code'}
      onClick={(e) => {
        e.stopPropagation()
        void copy()
      }}
      className="rounded px-1.5 py-0.5 font-sans text-[0.95em] hover:bg-[color-mix(in_srgb,currentColor_15%,transparent)] focus-visible:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}
