/**
 * Simple Discord-style markdown parser.
 * Supports: **bold**, *italic*, ~~strikethrough~~, `inline code`,
 * ```code blocks```, > quotes, ||spoiler||
 *
 * Returns an array of segments to render.
 */

export interface MarkdownSegment {
  type: 'text' | 'bold' | 'italic' | 'strikethrough' | 'code' | 'codeblock' | 'quote' | 'spoiler' | 'newline'
  content: string
  language?: string // for code blocks
}

export function parseMarkdown(input: string): MarkdownSegment[] {
  const segments: MarkdownSegment[] = []

  // First, handle code blocks (``` ... ```)
  const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  const withoutCodeBlocks: { type: 'raw' | 'codeblock'; content: string; language?: string }[] = []

  while ((match = codeBlockRegex.exec(input)) !== null) {
    if (match.index > lastIndex) {
      withoutCodeBlocks.push({ type: 'raw', content: input.slice(lastIndex, match.index) })
    }
    withoutCodeBlocks.push({ type: 'codeblock', content: match[2], language: match[1] || undefined })
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < input.length) {
    withoutCodeBlocks.push({ type: 'raw', content: input.slice(lastIndex) })
  }

  for (const block of withoutCodeBlocks) {
    if (block.type === 'codeblock') {
      segments.push({ type: 'codeblock', content: block.content, language: block.language })
      continue
    }

    // Parse inline markdown
    parseInline(block.content, segments)
  }

  return segments
}

function parseInline(text: string, segments: MarkdownSegment[]) {
  // Process line by line for quotes
  const lines = text.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (i > 0) {
      segments.push({ type: 'newline', content: '\n' })
    }

    // Check for quote lines
    if (line.startsWith('> ')) {
      segments.push({ type: 'quote', content: line.slice(2) })
      continue
    }

    // Inline patterns (order matters — more specific first)
    const inlineRegex = /(\*\*(.+?)\*\*|\*(.+?)\*|~~(.+?)~~|`(.+?)`|\|\|(.+?)\|\|)/g
    let lastIdx = 0
    let inlineMatch: RegExpExecArray | null

    while ((inlineMatch = inlineRegex.exec(line)) !== null) {
      // Add text before the match
      if (inlineMatch.index > lastIdx) {
        segments.push({ type: 'text', content: line.slice(lastIdx, inlineMatch.index) })
      }

      if (inlineMatch[2]) {
        segments.push({ type: 'bold', content: inlineMatch[2] })
      } else if (inlineMatch[3]) {
        segments.push({ type: 'italic', content: inlineMatch[3] })
      } else if (inlineMatch[4]) {
        segments.push({ type: 'strikethrough', content: inlineMatch[4] })
      } else if (inlineMatch[5]) {
        segments.push({ type: 'code', content: inlineMatch[5] })
      } else if (inlineMatch[6]) {
        segments.push({ type: 'spoiler', content: inlineMatch[6] })
      }

      lastIdx = inlineMatch.index + inlineMatch[0].length
    }

    // Add remaining text
    if (lastIdx < line.length) {
      segments.push({ type: 'text', content: line.slice(lastIdx) })
    }
  }
}
