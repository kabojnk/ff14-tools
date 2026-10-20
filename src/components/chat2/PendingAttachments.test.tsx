import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PendingAttachments } from '@/components/chat2/PendingAttachments'
import type { PendingAttachment } from '@/stores/draftStore'

const item = (overrides: Partial<PendingAttachment> = {}): PendingAttachment => ({
  id: 'a1',
  filename: 'cat.png',
  type: 'image',
  preview: 'blob:cat',
  spoiler: false,
  status: 'done',
  file: null,
  uploaded: { url: 'http://cdn/cat.png', type: 'image', filename: 'cat.png', size: 1, spoiler: false },
  ...overrides,
})

const handlers = () => ({ onRemove: vi.fn(), onRetry: vi.fn(), onToggleSpoiler: vi.fn() })

describe('PendingAttachments', () => {
  it('renders nothing without attachments', () => {
    const { container } = render(<PendingAttachments items={[]} {...handlers()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows a removable thumbnail for each attachment', () => {
    const h = handlers()
    render(<PendingAttachments items={[item(), item({ id: 'a2', filename: 'notes.pdf', type: 'file', preview: null })]} {...h} />)
    const tray = screen.getByRole('list', { name: 'Attachments' })
    expect(within(tray).getAllByRole('listitem')).toHaveLength(2)
    expect(within(tray).getByRole('img', { name: 'cat.png' })).toHaveAttribute('src', 'blob:cat')
    expect(within(tray).getByText('notes.pdf')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Remove notes.pdf' }))
    expect(h.onRemove).toHaveBeenCalledWith('a2')
  })

  it('shows an indeterminate progress indicator while uploading, and no Retry', () => {
    render(<PendingAttachments items={[item({ status: 'uploading', uploaded: null })]} {...handlers()} />)
    const progress = screen.getByRole('progressbar', { name: 'Uploading cat.png' })
    expect(progress).not.toHaveAttribute('aria-valuenow')
    expect(screen.queryByRole('button', { name: /Retry/ })).not.toBeInTheDocument()
  })

  it('a failed upload offers Retry and Remove', () => {
    const h = handlers()
    render(<PendingAttachments items={[item({ status: 'failed', uploaded: null })]} {...h} />)
    expect(screen.getByText('Upload failed')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry cat.png' }))
    expect(h.onRetry).toHaveBeenCalledWith('a1')
    fireEvent.click(screen.getByRole('button', { name: 'Remove cat.png' }))
    expect(h.onRemove).toHaveBeenCalledWith('a1')
  })

  it('the spoiler toggle is pressed when the attachment is a spoiler, and blurs the thumbnail', () => {
    const h = handlers()
    const { rerender } = render(<PendingAttachments items={[item()]} {...h} />)
    const toggle = screen.getByRole('button', { name: 'Spoiler cat.png' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(toggle)
    expect(h.onToggleSpoiler).toHaveBeenCalledWith('a1')

    rerender(<PendingAttachments items={[item({ spoiler: true })]} {...h} />)
    expect(screen.getByRole('button', { name: 'Spoiler cat.png' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('listitem')).toHaveAttribute('data-spoiler', 'true')
  })

  it('files (not photos, videos or GIFs) have no spoiler toggle', () => {
    render(<PendingAttachments items={[item({ filename: 'notes.pdf', type: 'file', preview: null })]} {...handlers()} />)
    expect(screen.queryByRole('button', { name: /Spoiler/ })).not.toBeInTheDocument()
  })
})
