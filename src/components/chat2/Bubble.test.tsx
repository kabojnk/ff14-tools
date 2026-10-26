import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Bubble } from '@/components/chat2/Bubble'
import type { Attachment, Message } from '@/types'

function msg(over: Partial<Message> = {}): Message {
  return {
    id: 'm1',
    conversation_id: 'c',
    space: 'main',
    channel_id: null,
    session_id: 's',
    author_id: 'alice',
    content: 'hello **there**',
    attachments: [],
    type: 'text',
    edited_at: null,
    deleted: false,
    reply_to: null,
    created_at: '2026-10-19T10:42:00Z',
    ...over,
  }
}

const photo = (spoiler: boolean): Attachment => ({ url: 'https://cdn/p.png', type: 'image', filename: 'p.png', size: 1, spoiler })

describe('Bubble', () => {
  it('renders the content as markdown', () => {
    render(<Bubble message={msg()} mine={false} tail={false} />)
    expect(screen.getByText('there').tagName).toBe('STRONG')
  })

  it('puts mine in --me and theirs in --them, with a tail only on a run start', () => {
    const { container, rerender } = render(<Bubble message={msg()} mine tail tick="sent" />)
    const bubble = container.querySelector('[data-bubble]')!
    expect(bubble).toHaveAttribute('data-mine', 'true')
    expect(bubble).toHaveAttribute('data-tail', 'true')
    expect(bubble).toHaveClass('bg-[color:var(--me)]')
    rerender(<Bubble message={msg()} mine={false} tail={false} />)
    expect(bubble).toHaveAttribute('data-mine', 'false')
    expect(bubble).toHaveAttribute('data-tail', 'false')
    expect(bubble).toHaveClass('bg-[color:var(--them)]')
  })

  it('tucks the time inside, with "edited" before it', () => {
    const at = new Date('2026-10-19T10:42:00Z')
    const time = at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    render(<Bubble message={msg({ edited_at: '2026-10-19T10:50:00Z' })} mine={false} tail={false} />)
    const meta = screen.getByText(time).closest('[data-meta]')!
    expect(meta).toHaveTextContent(new RegExp(`^edited\\s*${time}`))
    expect(screen.getByText(time).tagName).toBe('TIME')
  })

  it('shows ticks on my messages only', () => {
    const { container, rerender } = render(<Bubble message={msg()} mine tail={false} tick="read" />)
    expect(container.querySelector('[data-tick="read"]')).not.toBeNull()
    rerender(<Bubble message={msg()} mine={false} tail={false} tick="read" />)
    expect(container.querySelector('[data-tick]')).toBeNull()
  })

  it('offers Retry on a failed message', () => {
    const onRetry = vi.fn()
    render(<Bubble message={msg()} mine tail={false} tick="failed" onRetry={onRetry} />)
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalled()
  })

  it('looks up custom emoji', () => {
    render(<Bubble message={msg({ content: 'hi :blob:' })} mine={false} tail={false} emoji={(n) => (n === 'blob' ? 'https://cdn/blob.png' : undefined)} />)
    expect(screen.getByRole('img', { name: ':blob:' })).toHaveAttribute('src', 'https://cdn/blob.png')
  })

  it('overlays the time on a media-only message', () => {
    const { container } = render(<Bubble message={msg({ content: null, attachments: [photo(false)] })} mine={false} tail={false} />)
    expect(container.querySelector('[data-media-time] [data-meta]')).not.toBeNull()
  })

  it('blurs a revealed spoiler again when the item is re-marked as a spoiler', () => {
    const { rerender } = render(<Bubble message={msg({ content: null, attachments: [photo(true)] })} mine={false} tail={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Show spoiler' }))
    expect(screen.queryByText('SPOILER')).toBeNull()
    rerender(<Bubble message={msg({ content: null, attachments: [photo(false)] })} mine={false} tail={false} />)
    rerender(<Bubble message={msg({ content: null, attachments: [photo(true)] })} mine={false} tail={false} />)
    expect(screen.getByText('SPOILER')).toBeInTheDocument()
  })

  it('renders a header (the reply strip) above the content', () => {
    render(<Bubble message={msg()} mine={false} tail={false} header={<div>quoted</div>} />)
    expect(screen.getByText('quoted')).toBeInTheDocument()
  })

  it('renders a voice memo as a voice bubble, with the time inside it', () => {
    const voice = {
      ...msg({ content: null }),
      attachments: [{ url: 'https://cdn/v.m4a', type: 'audio' as const, filename: 'voice-1.m4a', size: 1, spoiler: false, duration_ms: 4000, peaks: [] }],
    }
    const { container } = render(<Bubble message={voice} mine={false} tail />)
    const bubble = container.querySelector('[data-voice-bubble]')
    expect(bubble).not.toBeNull()
    expect(bubble?.querySelector('[data-meta] time')).not.toBeNull()
    expect(container.querySelector('[data-media]')).toBeNull()
  })
})
