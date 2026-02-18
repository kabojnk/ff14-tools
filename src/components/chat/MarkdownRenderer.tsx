import { useState } from 'react'
import { parseMarkdown, type MarkdownSegment } from '@/lib/markdown'

interface MarkdownRendererProps {
  content: string
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const segments = parseMarkdown(content)

  return (
    <span>
      {segments.map((segment, i) => (
        <SegmentRenderer key={i} segment={segment} />
      ))}
    </span>
  )
}

function SegmentRenderer({ segment }: { segment: MarkdownSegment }) {
  switch (segment.type) {
    case 'text':
      return <>{segment.content}</>
    case 'bold':
      return <strong className="font-bold">{segment.content}</strong>
    case 'italic':
      return <em className="italic">{segment.content}</em>
    case 'strikethrough':
      return <span className="line-through">{segment.content}</span>
    case 'code':
      return (
        <code className="rounded-[3px] bg-[hsl(var(--color-bg-tertiary))] px-1 py-0.5 font-mono text-[0.875em] text-[#e88388]">
          {segment.content}
        </code>
      )
    case 'codeblock':
      return (
        <pre className="my-1 overflow-x-auto rounded bg-[hsl(var(--color-bg-tertiary))] p-3 text-sm">
          <code className="font-mono text-secondary">{segment.content}</code>
        </pre>
      )
    case 'quote':
      return (
        <div className="my-0.5 border-l-[3px] border-[hsl(var(--color-interactive-normal))] pl-3">
          <span className="text-secondary">{segment.content}</span>
        </div>
      )
    case 'spoiler':
      return <SpoilerText content={segment.content} />
    case 'newline':
      return <br />
    default:
      return <>{segment.content}</>
  }
}

function SpoilerText({ content }: { content: string }) {
  const [revealed, setRevealed] = useState(false)

  return (
    <span
      onClick={() => setRevealed(!revealed)}
      className={`
        cursor-pointer rounded-[3px] px-0.5 transition-all
        ${revealed
          ? 'bg-[hsl(var(--color-spoiler-bg))]'
          : 'bg-[hsl(var(--color-spoiler-hidden))] text-transparent hover:opacity-80'
        }
      `}
    >
      {content}
    </span>
  )
}
