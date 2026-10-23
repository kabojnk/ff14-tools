import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@supabase/supabase-js'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))

import { MediaViewer, type ViewerItem } from '@/components/gallery/MediaViewer'
import { useAuthStore } from '@/stores/authStore'
import { useProfileStore } from '@/stores/profileStore'
import type { Profile } from '@/types'

// jsdom has no PointerEvent: a MouseEvent carries clientX, which is all the swipe reads.
beforeAll(() => {
  if (!('PointerEvent' in window)) {
    class PointerEventPolyfill extends MouseEvent {
      pointerId: number
      pointerType: string
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init)
        this.pointerId = init.pointerId ?? 1
        this.pointerType = init.pointerType ?? 'touch'
      }
    }
    ;(window as unknown as { PointerEvent: unknown }).PointerEvent = PointerEventPolyfill
  }
})

const profile = (id: string, nickname: string): Profile => ({
  id,
  nickname,
  avatar_url: null,
  banner_url: null,
  profile_message: null,
  status: 'online',
  custom_status_text: null,
  status_id: null,
  read_receipts: true,
  lock_pin_length: null,
  presence_override: null,
  last_seen_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
})

const item = (n: number, over: Partial<ViewerItem> = {}): ViewerItem => ({
  id: `i${n}`,
  message_id: `m${n}`,
  url: `https://cdn.test/${n}.png`,
  filename: `${n}.png`,
  kind: 'image',
  spoiler: false,
  space: 'schist',
  created_at: '2026-10-03T09:14:00Z',
  author_id: 'bea',
  ...over,
})

const three = [item(1), item(2), item(3)]

beforeEach(() => {
  useAuthStore.setState({ user: { id: 'alice' } as User })
  useProfileStore.setState({ profiles: { alice: profile('alice', 'Alice'), bea: profile('bea', 'Bea') } })
})

const count = () => screen.getByTestId('viewer-count').textContent
const prev = () => screen.getByRole('button', { name: 'Previous' })
const next = () => screen.getByRole('button', { name: 'Next' })

describe('MediaViewer', () => {
  it('shows the sender, the space and the time in the header', () => {
    render(<MediaViewer items={three} index={0} onClose={() => {}} />)
    expect(screen.getByText('Bea')).toBeInTheDocument()
    expect(screen.getByText(/^Schist · /)).toBeInTheDocument()
  })

  it("shows the partner's name for her photo, and mine for mine", () => {
    render(<MediaViewer items={[item(1), item(2, { author_id: 'alice', space: 'main' })]} index={0} onClose={() => {}} />)
    expect(screen.getByText('Bea')).toBeInTheDocument()
    fireEvent.click(next())
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText(/^Main · /)).toBeInTheDocument()
  })

  it('opens above the desktop panel', () => {
    render(<MediaViewer items={three} index={0} onClose={() => {}} />)
    expect(screen.getByRole('dialog')).toHaveClass('z-[60]')
  })

  it('the arrows move through the items without wrapping, disabled at the ends', () => {
    render(<MediaViewer items={three} index={0} onClose={() => {}} />)
    expect(count()).toBe('1 of 3')
    expect(prev()).toBeDisabled()
    fireEvent.click(next())
    expect(count()).toBe('2 of 3')
    expect(screen.getByRole('img', { name: '2.png' })).toBeInTheDocument()
    fireEvent.click(next())
    expect(count()).toBe('3 of 3')
    expect(next()).toBeDisabled()
    fireEvent.click(next())
    expect(count()).toBe('3 of 3')
    fireEvent.click(prev())
    expect(count()).toBe('2 of 3')
  })

  it('Left and Right keys move, Esc closes', () => {
    const onClose = vi.fn()
    render(<MediaViewer items={three} index={1} onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'ArrowRight' })
    expect(count()).toBe('3 of 3')
    fireEvent.keyDown(document, { key: 'ArrowRight' })
    expect(count()).toBe('3 of 3')
    fireEvent.keyDown(document, { key: 'ArrowLeft' })
    fireEvent.keyDown(document, { key: 'ArrowLeft' })
    expect(count()).toBe('1 of 3')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Esc does nothing while the PIN pad is open', () => {
    const onClose = vi.fn()
    const pad = document.createElement('div')
    pad.setAttribute('data-pin-pad', '')
    document.body.appendChild(pad)
    render(<MediaViewer items={three} index={0} onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
    pad.remove()
  })

  it('a horizontal swipe of more than 50px moves; a short one does not', () => {
    render(<MediaViewer items={three} index={0} onClose={() => {}} />)
    const stage = screen.getByTestId('viewer-stage')
    fireEvent.pointerDown(stage, { clientX: 300, clientY: 200, pointerId: 1 })
    fireEvent.pointerUp(stage, { clientX: 270, clientY: 200, pointerId: 1 })
    expect(count()).toBe('1 of 3')
    fireEvent.pointerDown(stage, { clientX: 300, clientY: 200, pointerId: 1 })
    fireEvent.pointerUp(stage, { clientX: 200, clientY: 205, pointerId: 1 })
    expect(count()).toBe('2 of 3')
    fireEvent.pointerDown(stage, { clientX: 100, clientY: 200, pointerId: 1 })
    fireEvent.pointerUp(stage, { clientX: 220, clientY: 200, pointerId: 1 })
    expect(count()).toBe('1 of 3')
  })

  it('"Show in chat" calls back with the current item', () => {
    const onShowInChat = vi.fn()
    render(<MediaViewer items={three} index={0} onClose={() => {}} onShowInChat={onShowInChat} />)
    fireEvent.click(next())
    fireEvent.click(screen.getByRole('button', { name: 'Show in chat' }))
    expect(onShowInChat).toHaveBeenCalledWith(three[1])
  })

  it('has no "Show in chat" without the callback', () => {
    render(<MediaViewer items={three} index={0} onClose={() => {}} />)
    expect(screen.queryByRole('button', { name: 'Show in chat' })).toBeNull()
  })

  it('each item starts with its spoiler hidden', () => {
    render(<MediaViewer items={[item(1, { spoiler: true }), item(2, { spoiler: true })]} index={0} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Show spoiler' }))
    expect(screen.queryByRole('button', { name: 'Show spoiler' })).toBeNull()
    fireEvent.click(next())
    expect(screen.getByRole('button', { name: 'Show spoiler' })).toBeInTheDocument()
    fireEvent.click(prev())
    expect(screen.getByRole('button', { name: 'Show spoiler' })).toBeInTheDocument()
  })

  it('pauses a playing video when moving on', () => {
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve())
    render(<MediaViewer items={[item(1, { kind: 'video', url: 'https://cdn.test/1.mp4' }), item(2)]} index={0} onClose={() => {}} />)
    expect(document.querySelector('video')).not.toBeNull()
    pause.mockClear()
    fireEvent.click(next())
    expect(pause).toHaveBeenCalled()
  })

  it('a failed load shows the "Couldn\'t load" tile', () => {
    render(<MediaViewer items={three} index={0} onClose={() => {}} />)
    fireEvent.error(screen.getByRole('img', { name: '1.png' }))
    expect(screen.getByText("Couldn't load")).toBeInTheDocument()
    fireEvent.click(next())
    expect(screen.queryByText("Couldn't load")).toBeNull()
  })

  it('reaching the last loaded item loads more when there is more', () => {
    const onLoadMore = vi.fn()
    const { rerender } = render(<MediaViewer items={three} index={1} hasMore onLoadMore={onLoadMore} onClose={() => {}} />)
    expect(onLoadMore).not.toHaveBeenCalled()
    fireEvent.click(next())
    expect(onLoadMore).toHaveBeenCalledTimes(1)
    // The next page arrives: the count grows and Next works again.
    rerender(<MediaViewer items={[...three, item(4)]} index={1} hasMore={false} onLoadMore={onLoadMore} onClose={() => {}} />)
    expect(count()).toBe('3 of 4')
    fireEvent.click(next())
    expect(count()).toBe('4 of 4')
    expect(onLoadMore).toHaveBeenCalledTimes(1)
  })

  it('asks again when a page brought no photos, but not while one is loading', () => {
    const onLoadMore = vi.fn()
    const { rerender } = render(<MediaViewer items={three} index={2} hasMore loading onLoadMore={onLoadMore} onClose={() => {}} />)
    expect(onLoadMore).not.toHaveBeenCalled()
    rerender(<MediaViewer items={three} index={2} hasMore loading={false} onLoadMore={onLoadMore} onClose={() => {}} />)
    expect(onLoadMore).toHaveBeenCalledTimes(1)
  })

  it('does not load more at the end when there is no more', () => {
    const onLoadMore = vi.fn()
    render(<MediaViewer items={three} index={2} hasMore={false} onLoadMore={onLoadMore} onClose={() => {}} />)
    expect(onLoadMore).not.toHaveBeenCalled()
  })

  it('moves to the nearest item when the current one is deleted, and closes when none are left', () => {
    const onClose = vi.fn()
    const { rerender } = render(<MediaViewer items={three} index={2} onClose={onClose} />)
    act(() => {
      rerender(<MediaViewer items={[item(1), item(2)]} index={2} onClose={onClose} />)
    })
    expect(count()).toBe('2 of 2')
    expect(screen.getByRole('img', { name: '2.png' })).toBeInTheDocument()
    act(() => {
      rerender(<MediaViewer items={[item(2)]} index={2} onClose={onClose} />)
    })
    expect(count()).toBe('1 of 1')
    act(() => {
      rerender(<MediaViewer items={[]} index={2} onClose={onClose} />)
    })
    expect(onClose).toHaveBeenCalled()
  })

  it('keeps showing the same item when items are added before it', () => {
    const { rerender } = render(<MediaViewer items={three} index={1} onClose={() => {}} />)
    rerender(<MediaViewer items={[item(0), ...three]} index={1} onClose={() => {}} />)
    expect(count()).toBe('3 of 4')
    expect(screen.getByRole('img', { name: '2.png' })).toBeInTheDocument()
  })

  it('the close button closes', () => {
    const onClose = vi.fn()
    render(<MediaViewer items={three} index={0} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
  })
})
