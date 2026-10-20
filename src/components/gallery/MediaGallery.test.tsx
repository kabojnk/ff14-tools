import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@supabase/supabase-js'
import type { MediaGalleryOptions } from '@/hooks/useMediaGallery'
import type { MediaItem, Profile } from '@/types'

interface FakeGallery {
  items: MediaItem[]
  loading: boolean
  hasMore: boolean
  error: string | null
  loadMore: () => void
  retry: () => void
}

const { useMediaGallery, main, fallback } = vi.hoisted(() => {
  const blank = () => ({ items: [], loading: false, hasMore: false, error: null, loadMore: () => {}, retry: () => {} })
  const main: { current: FakeGallery } = { current: blank() }
  const fallback: { current: FakeGallery } = { current: blank() }
  const useMediaGallery = (o: MediaGalleryOptions): FakeGallery => {
    // The "Without the filter" call is the one limited to 5.
    if (o.limit === 5) return o.enabled === false ? blank() : fallback.current
    return main.current
  }
  return { useMediaGallery: vi.fn(useMediaGallery), main, fallback }
})
vi.mock('@/hooks/useMediaGallery', () => ({ useMediaGallery }))

import { MediaGallery, type GalleryViewerProps } from '@/components/gallery/MediaGallery'
import { useAuthStore } from '@/stores/authStore'
import { useProfileStore } from '@/stores/profileStore'

// jsdom has no IntersectionObserver: a stub that records what each observer watches.
class FakeIO {
  static all: FakeIO[] = []
  targets: Element[] = []
  constructor(
    public cb: IntersectionObserverCallback,
    public options?: IntersectionObserverInit,
  ) {
    FakeIO.all.push(this)
  }
  observe(el: Element) {
    this.targets.push(el)
  }
  unobserve(el: Element) {
    this.targets = this.targets.filter((t) => t !== el)
  }
  disconnect() {
    this.targets = []
  }
  takeRecords() {
    return []
  }
}

/** Reports `el` as (not) intersecting to every observer watching it. */
function intersect(el: Element, isIntersecting = true) {
  act(() => {
    for (const io of FakeIO.all.filter((o) => o.targets.includes(el))) {
      io.cb([{ target: el, isIntersecting } as IntersectionObserverEntry], io as unknown as IntersectionObserver)
    }
  })
}

const NOW = new Date(2026, 9, 20, 12)
let n = 0
function item(over: Partial<MediaItem> = {}): MediaItem {
  n += 1
  return {
    id: `i${n}`,
    message_id: `m${n}`,
    conversation_id: 'conv',
    space: 'main',
    session_id: 's',
    kind: 'image',
    url: `http://x/${n}.png`,
    filename: `${n}.png`,
    extension: 'png',
    size: 1024,
    spoiler: false,
    created_at: new Date(2026, 9, 19).toISOString(),
    ...over,
  }
}

function gallery(over: Partial<FakeGallery> = {}): FakeGallery {
  return { items: [], loading: false, hasMore: false, error: null, loadMore: vi.fn(), retry: vi.fn(), ...over }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  FakeIO.all = []
  vi.stubGlobal('IntersectionObserver', FakeIO)
  main.current = gallery()
  fallback.current = gallery()
  useAuthStore.setState({ user: { id: 'alice' } as User })
  useProfileStore.setState({ profiles: { bea: { id: 'bea', nickname: 'Bea' } as Profile } })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/** The options of the latest "Without the filter" call (the one limited to 5). */
const lastFallbackCall = () => {
  const calls = useMediaGallery.mock.calls.map(([o]) => o).filter((o) => o.limit === 5)
  return calls[calls.length - 1]
}

const renderGallery = (onOpen = vi.fn()) => {
  const utils = render(<MediaGallery conversationId="conv" space="main" onOpen={onOpen} />)
  return { ...utils, onOpen }
}

describe('MediaGallery', () => {
  it('groups by month under headers', () => {
    main.current = gallery({
      items: [
        item({ created_at: new Date(2026, 9, 18).toISOString() }),
        item({ created_at: new Date(2026, 8, 3).toISOString() }),
        item({ created_at: new Date(2025, 8, 3).toISOString() }),
      ],
    })
    renderGallery()
    expect(screen.getByText('October')).toBeInTheDocument()
    expect(screen.getByText('September')).toBeInTheDocument()
    expect(screen.getByText('September 2025')).toBeInTheDocument()
    expect(document.querySelectorAll('[data-media-item]')).toHaveLength(3)
  })

  it('badges GIFs, and keeps spoilers blurred and marked', () => {
    main.current = gallery({ items: [item({ kind: 'gif' }), item({ spoiler: true })] })
    renderGallery()
    const [gif, spoiler] = document.querySelectorAll('[data-media-item]')
    expect(gif).toHaveAttribute('data-media-item', 'gif')
    expect(within(gif as HTMLElement).getByText('GIF')).toBeInTheDocument()
    expect(spoiler).toHaveAttribute('data-spoiler')
    expect(within(spoiler as HTMLElement).getByText('SPOILER')).toBeInTheDocument()
  })

  it('opens a thumbnail with its index among the visual items', async () => {
    const items = [item(), item({ kind: 'video' }), item({ kind: 'gif' })]
    main.current = gallery({ items })
    const { onOpen } = renderGallery()
    await userEvent.click(document.querySelectorAll('[data-media-item]')[2] as HTMLElement)
    expect(onOpen).toHaveBeenCalledWith(2, items)
  })

  it('hands the viewer the live list: new pages, hasMore and loadMore', async () => {
    const loadMore = vi.fn()
    const items = [item(), item({ kind: 'file' }), item({ kind: 'video' })]
    main.current = gallery({ items, hasMore: true, loadMore })
    const renderViewer = vi.fn((_props: GalleryViewerProps) => <div data-testid="viewer" />)
    const { rerender } = render(<MediaGallery conversationId="conv" space="main" renderViewer={renderViewer} />)
    expect(renderViewer).not.toHaveBeenCalled()
    await userEvent.click(document.querySelectorAll('[data-media-item]')[1] as HTMLElement)
    expect(screen.getByTestId('viewer')).toBeInTheDocument()
    expect(renderViewer).toHaveBeenLastCalledWith(
      expect.objectContaining({ items: [items[0], items[2]], index: 1, hasMore: true, loading: false, loadMore }),
    )

    const more = item()
    main.current = gallery({ items: [...items, more], hasMore: false, loadMore })
    rerender(<MediaGallery conversationId="conv" space="main" renderViewer={renderViewer} />)
    expect(renderViewer).toHaveBeenLastCalledWith(expect.objectContaining({ items: [items[0], items[2], more], index: 1, hasMore: false }))

    const last = renderViewer.mock.calls[renderViewer.mock.calls.length - 1]
    act(() => last[0].onClose())
    expect(screen.queryByTestId('viewer')).toBeNull()
  })

  it('shows a link’s site large, and the address, sender and date small', () => {
    main.current = gallery({
      items: [
        item({ kind: 'link', url: 'https://www.example.com/guide', filename: null, extension: null, author_id: 'bea' }),
        item({ kind: 'link', url: 'https://youtube.com/watch?v=x', filename: null, extension: null, author_id: 'alice' }),
      ],
    })
    renderGallery()
    const [bea, mine] = document.querySelectorAll('[data-media-item="link"]')
    expect(bea).toHaveAttribute('href', 'https://www.example.com/guide')
    expect(bea).toHaveAttribute('target', '_blank')
    expect(within(bea as HTMLElement).getByText('example.com')).toBeInTheDocument()
    expect(within(bea as HTMLElement).getByText(/^example\.com\/guide · Bea · /)).toBeInTheDocument()
    expect(within(mine as HTMLElement).getByText(/^youtube\.com\/watch\?v=x · you · /)).toBeInTheDocument()
  })

  it('shows a file row with its extension, name, size and space', () => {
    main.current = gallery({ items: [item({ kind: 'file', filename: 'raid.PMP', extension: 'pmp', size: 2048 })] })
    renderGallery()
    const row = document.querySelector('[data-media-item="file"]') as HTMLElement
    expect(within(row).getByText('PMP')).toBeInTheDocument()
    expect(within(row).getByText('raid.PMP')).toBeInTheDocument()
    expect(within(row).getByText(/^2 KB · Main · /)).toBeInTheDocument()
  })

  it('shows a skeleton grid on the first load', () => {
    main.current = gallery({ loading: true })
    renderGallery()
    expect(document.querySelector('[data-gallery-skeleton]')).toBeInTheDocument()
  })

  it('offers Retry when loading failed', async () => {
    main.current = gallery({ error: 'nope' })
    renderGallery()
    expect(screen.getByText("Couldn't load media.")).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(main.current.retry).toHaveBeenCalled()
  })

  it('offers Retry at the bottom when a later page failed', async () => {
    main.current = gallery({ items: [item()], error: 'nope', hasMore: true })
    renderGallery()
    expect(document.querySelectorAll('[data-media-item]')).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(main.current.retry).toHaveBeenCalled()
  })

  it('keeps the empty-state texts', () => {
    renderGallery()
    expect(screen.getByText('No media in this space yet.')).toBeInTheDocument()
  })

  describe('with an extension filter', () => {
    it('heads the matches and shows recent files dimmed below fewer than 3', async () => {
      main.current = gallery({ items: [item({ kind: 'file', filename: 'raid.PMP', extension: 'pmp' })] })
      fallback.current = gallery({
        items: [item({ kind: 'file', filename: 'notes.zip', extension: 'zip' }), item({ kind: 'file', filename: 'guide.pdf', extension: 'pdf' })],
      })
      renderGallery()
      await userEvent.type(screen.getByLabelText('Extension'), 'pmp')
      expect(screen.getByText('1 file · .pmp')).toBeInTheDocument()
      expect(screen.getByText('Without the filter')).toBeInTheDocument()
      expect(screen.getByText('notes.zip')).toBeInTheDocument()
      // Only the matches count as gallery items.
      expect(document.querySelectorAll('[data-media-item]')).toHaveLength(1)
      expect(document.querySelectorAll('[data-media-fallback]')).toHaveLength(2)
      const fallbackCall = lastFallbackCall()
      expect(fallbackCall).toMatchObject({ extension: '', limit: 5, enabled: true })
    })

    it('leaves the fallback off with 3 or more matches, and without an extension', async () => {
      main.current = gallery({ items: [1, 2, 3].map(() => item({ kind: 'file', extension: 'pmp' })) })
      fallback.current = gallery({ items: [item({ kind: 'file', filename: 'notes.zip' })] })
      renderGallery()
      expect(lastFallbackCall().enabled).toBe(false)
      await userEvent.type(screen.getByLabelText('Extension'), 'pmp')
      expect(screen.getByText('3 files · .pmp')).toBeInTheDocument()
      expect(screen.queryByText('Without the filter')).toBeNull()
      expect(lastFallbackCall().enabled).toBe(false)
    })
  })

  describe('infinite scroll', () => {
    it('loads more when the sentinel comes into view, rooted at the scroll container', () => {
      const root = document.createElement('div')
      main.current = gallery({ items: [item()], hasMore: true })
      render(<MediaGallery conversationId="conv" space="main" onOpen={vi.fn()} scrollRoot={root} />)
      const sentinel = document.querySelector('[data-gallery-sentinel]')!
      const io = FakeIO.all.find((o) => o.targets.includes(sentinel))!
      expect(io.options?.root).toBe(root)
      expect(main.current.loadMore).not.toHaveBeenCalled()
      intersect(sentinel)
      expect(main.current.loadMore).toHaveBeenCalledTimes(1)
    })

    it('keeps loading while the sentinel stays in view', () => {
      const loadMore = vi.fn()
      main.current = gallery({ items: [item()], hasMore: true, loadMore })
      const { rerender } = renderGallery()
      intersect(document.querySelector('[data-gallery-sentinel]')!)
      expect(loadMore).toHaveBeenCalledTimes(1)

      // The page loads, the sentinel never left the view: no new intersection event.
      main.current = gallery({ items: [item()], hasMore: true, loading: true, loadMore })
      rerender(<MediaGallery conversationId="conv" space="main" onOpen={vi.fn()} />)
      main.current = gallery({ items: [item(), item()], hasMore: true, loading: false, loadMore })
      rerender(<MediaGallery conversationId="conv" space="main" onOpen={vi.fn()} />)
      expect(loadMore).toHaveBeenCalledTimes(2)
    })
  })

  describe('video durations', () => {
    const setDuration = (video: HTMLVideoElement, d: number) => {
      Object.defineProperty(video, 'duration', { configurable: true, value: d })
      fireEvent.loadedMetadata(video)
    }

    it('reads durations only for videos in view, one at a time', () => {
      main.current = gallery({ items: [item({ kind: 'video' }), item({ kind: 'video' })] })
      renderGallery()
      const [first, second] = document.querySelectorAll('[data-media-item="video"]')
      expect(document.querySelectorAll('video')).toHaveLength(0)

      intersect(first)
      intersect(second)
      expect(first.querySelector('video')).not.toBeNull()
      expect(second.querySelector('video')).toBeNull()

      setDuration(first.querySelector('video')!, 42)
      expect(within(first as HTMLElement).getByText('0:42')).toBeInTheDocument()
      const video = second.querySelector('video')!
      expect(video).toHaveAttribute('preload', 'metadata')
      setDuration(video, 65)
      expect(within(second as HTMLElement).getByText('1:05')).toBeInTheDocument()
    })

    it('a video that failed shows the Couldn’t load tile and frees the slot', () => {
      main.current = gallery({ items: [item({ kind: 'video', filename: 'clip.mp4' }), item({ kind: 'video' })] })
      renderGallery()
      const [first, second] = document.querySelectorAll('[data-media-item="video"]')
      intersect(first)
      intersect(second)
      fireEvent.error(first.querySelector('video')!)
      expect(within(first as HTMLElement).getByText("Couldn't load")).toBeInTheDocument()
      expect(second.querySelector('video')).not.toBeNull()
    })
  })

  it('a photo shows the skeleton until it loads, and the tile when it fails', () => {
    main.current = gallery({ items: [item(), item({ filename: 'broken.png' })] })
    renderGallery()
    const [ok, broken] = document.querySelectorAll('[data-media-item]')
    expect(ok.querySelector('[data-media-skeleton]')).not.toBeNull()
    fireEvent.load(ok.querySelector('img')!)
    expect(ok.querySelector('[data-media-skeleton]')).toBeNull()
    fireEvent.error(broken.querySelector('img')!)
    expect(within(broken as HTMLElement).getByText("Couldn't load")).toBeInTheDocument()
  })
})
