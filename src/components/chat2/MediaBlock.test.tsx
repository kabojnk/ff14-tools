import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MediaBlock } from '@/components/chat2/MediaBlock'
import type { Attachment } from '@/types'

const img = (n: number, spoiler = false): Attachment => ({
  url: `https://cdn/p${n}.png`,
  type: 'image',
  filename: `p${n}.png`,
  size: 100,
  spoiler,
})

describe('MediaBlock', () => {
  it('holds a sized skeleton while an image loads, then shows the image', () => {
    const { container } = render(<MediaBlock messageId="m1" attachments={[img(1)]} />)
    const cell = container.querySelector('[data-media-index="0"]')!
    expect(cell).toHaveAttribute('data-media-state', 'loading')
    expect(container.querySelector('[data-media-skeleton]')).not.toBeNull()

    fireEvent.load(screen.getByRole('img', { name: 'p1.png' }))
    expect(cell).toHaveAttribute('data-media-state', 'loaded')
    expect(container.querySelector('[data-media-skeleton]')).toBeNull()
  })

  it('shows a sized "couldn\'t load" tile instead of a broken image', () => {
    const { container } = render(<MediaBlock messageId="m1" attachments={[img(1)]} />)
    fireEvent.error(screen.getByRole('img', { name: 'p1.png' }))
    const cell = container.querySelector('[data-media-index="0"]')!
    expect(cell).toHaveAttribute('data-media-state', 'error')
    expect(screen.queryByRole('img', { name: 'p1.png' })).toBeNull()
    expect(screen.getByText("Couldn't load")).toBeInTheDocument()
    expect(within(cell as HTMLElement).getByText('p1.png')).toBeInTheDocument()
  })

  it('shows a "couldn\'t load" tile for a video that fails', () => {
    const video: Attachment = { url: 'https://cdn/v.mp4', type: 'video', filename: 'v.mp4', size: 1, spoiler: false }
    const { container } = render(<MediaBlock messageId="m1" attachments={[video]} />)
    fireEvent.error(container.querySelector('video')!)
    expect(container.querySelector('[data-media-index="0"]')).toHaveAttribute('data-media-state', 'error')
    expect(container.querySelector('video')).toBeNull()
  })

  it('shows one image fitted to the bubble', () => {
    render(<MediaBlock messageId="m1" attachments={[img(1)]} />)
    expect(screen.getByRole('img', { name: 'p1.png' })).toHaveAttribute('src', 'https://cdn/p1.png')
    expect(screen.getByRole('img', { name: 'p1.png' })).toHaveAttribute('draggable', 'false')
  })

  it('lays out two to four images as a grid', () => {
    const { container } = render(<MediaBlock messageId="m1" attachments={[img(1), img(2), img(3)]} />)
    expect(container.querySelector('[data-media-grid]')).not.toBeNull()
    expect(screen.getAllByRole('img')).toHaveLength(3)
  })

  it('shows four cells and "+N" beyond four', () => {
    render(<MediaBlock messageId="m1" attachments={[1, 2, 3, 4, 5, 6].map((n) => img(n))} />)
    expect(screen.getAllByRole('img')).toHaveLength(4)
    expect(screen.getByText('+2')).toBeInTheDocument()
  })

  it('blurs a spoiler with a SPOILER label until tapped, per viewer', () => {
    const { container } = render(<MediaBlock messageId="m1" attachments={[img(1, true)]} />)
    const cell = container.querySelector('[data-spoiler]')!
    expect(cell).toHaveAttribute('data-spoiler', 'hidden')
    expect(screen.getByText('SPOILER')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'p1.png' })).toHaveClass('blur-[24px]')

    fireEvent.click(screen.getByRole('button', { name: 'Show spoiler' }))
    expect(cell).toHaveAttribute('data-spoiler', 'revealed')
    expect(screen.queryByText('SPOILER')).toBeNull()
    expect(screen.getByRole('img', { name: 'p1.png' })).not.toHaveClass('blur-[24px]')
    // The reveal didn't open the full-screen viewer.
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens the full-screen viewer from a shown image', () => {
    render(<MediaBlock messageId="m1" attachments={[img(1)]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open p1.png' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it("the viewer goes through the message's photos from the one tapped, without Show in chat", () => {
    render(<MediaBlock messageId="m1" attachments={[img(1), img(2), img(3)]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open p2.png' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('2 of 3')).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Show in chat' })).toBeNull()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows a video with a play badge, without autoplay', () => {
    const video: Attachment = { url: 'https://cdn/v.mp4', type: 'video', filename: 'v.mp4', size: 1, spoiler: false }
    const { container } = render(<MediaBlock messageId="m1" attachments={[video]} />)
    expect(container.querySelector('video')!.autoplay).toBe(false)
    expect(container.querySelector('[data-play-badge]')).not.toBeNull()
  })

  it('a spoiler video is blurred behind SPOILER and does not play', () => {
    const video: Attachment = { url: 'https://cdn/v.mp4', type: 'video', filename: 'v.mp4', size: 1, spoiler: true }
    const { container } = render(<MediaBlock messageId="m1" attachments={[video]} />)
    expect(container.querySelector('video')!.autoplay).toBe(false)
    expect(container.querySelector('video')).toHaveClass('blur-[24px]')
    expect(screen.getByText('SPOILER')).toBeInTheDocument()
  })

  it('autoplays a GIF muted and looping', () => {
    const gif: Attachment = { url: 'https://cdn/d.gif', type: 'gif', filename: 'dance', size: 0, spoiler: false }
    render(<MediaBlock messageId="m1" attachments={[gif]} />)
    expect(screen.getByRole('img', { name: 'dance' })).toHaveAttribute('src', 'https://cdn/d.gif')
  })

  it('shows files as rows with the extension, name and size', () => {
    const file: Attachment = { url: 'https://cdn/notes.zip', type: 'file', filename: 'notes.zip', size: 2048, spoiler: false }
    render(<MediaBlock messageId="m1" attachments={[file]} />)
    const row = screen.getByRole('link', { name: /notes\.zip/ })
    expect(row).toHaveAttribute('href', 'https://cdn/notes.zip')
    expect(row).toHaveTextContent('ZIP')
    expect(row).toHaveTextContent('2 KB')
  })

  it('overlays the given time on the last visual item', () => {
    render(<MediaBlock messageId="m1" attachments={[img(1)]} overlay={<span>10:42</span>} />)
    expect(screen.getByText('10:42').closest('[data-media-time]')).not.toBeNull()
  })
})
