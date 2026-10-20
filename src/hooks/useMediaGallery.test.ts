import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MediaItem } from '@/types'

const { rpc, from, inIds } = vi.hoisted(() => {
  const inIds = vi.fn()
  return { rpc: vi.fn(), inIds, from: vi.fn(() => ({ select: () => ({ in: inIds }) })) }
})
vi.mock('@/lib/supabase', () => ({ supabase: { rpc, from } }))

import { useMediaGallery, type MediaGalleryOptions } from '@/hooks/useMediaGallery'

function item(n: number, kind: MediaItem['kind'] = 'image'): MediaItem {
  return {
    id: `id-${String(n).padStart(3, '0')}`,
    message_id: `m-${n}`,
    conversation_id: 'conv',
    space: 'main',
    session_id: 's',
    kind,
    url: `http://x/${n}`,
    filename: null,
    extension: null,
    size: null,
    spoiler: false,
    created_at: `2026-10-19T10:${String(n % 60).padStart(2, '0')}:00Z`,
  }
}

type Res = { data: MediaItem[] | null; error: { message: string } | null }

function deferred() {
  let resolve!: (v: Res) => void
  const promise = new Promise<Res>((r) => { resolve = r })
  return { promise, resolve }
}

const base: MediaGalleryOptions = { conversationId: 'conv', space: 'main', scope: 'space', kind: 'all', extension: '' }

beforeEach(() => {
  rpc.mockReset()
  rpc.mockResolvedValue({ data: [], error: null })
  inIds.mockReset()
  inIds.mockImplementation(async (_col: string, ids: string[]) => ({
    data: ids.map((id) => ({ id, author_id: `author-of-${id}` })),
    error: null,
  }))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useMediaGallery', () => {
  it('asks get_media for this space and the visual kinds', async () => {
    rpc.mockResolvedValue({ data: [item(1)], error: null })
    const { result } = renderHook(() => useMediaGallery(base))
    await waitFor(() => expect(result.current.items).toHaveLength(1))
    expect(rpc).toHaveBeenCalledWith('get_media', {
      p_conversation: 'conv',
      p_space: 'main',
      p_kinds: ['image', 'video', 'gif'],
      p_extension: null,
      p_before: null,
      p_before_id: null,
      p_limit: 60,
    })
    expect(result.current.loading).toBe(false)
    expect(result.current.hasMore).toBe(false)
  })

  it('passes a null space for Both', async () => {
    renderHook(() => useMediaGallery({ ...base, scope: 'both' }))
    await waitFor(() => expect(rpc).toHaveBeenCalled())
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_space: null })
  })

  it('normalises the extension and searches every kind from All', async () => {
    renderHook(() => useMediaGallery({ ...base, extension: ' .ZIP' }))
    await waitFor(() => expect(rpc).toHaveBeenCalled())
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_kinds: null, p_extension: 'zip' })
  })

  it('debounces typing in the extension by 300 ms', async () => {
    vi.useFakeTimers()
    const { rerender } = renderHook((o: MediaGalleryOptions) => useMediaGallery(o), {
      initialProps: { ...base, kind: 'files' },
    })
    await act(async () => {})
    expect(rpc).toHaveBeenCalledTimes(1)

    rerender({ ...base, kind: 'files', extension: 'p' })
    rerender({ ...base, kind: 'files', extension: 'pm' })
    await act(async () => { vi.advanceTimersByTime(200) })
    rerender({ ...base, kind: 'files', extension: 'pmp' })
    await act(async () => { vi.advanceTimersByTime(299) })
    expect(rpc).toHaveBeenCalledTimes(1)
    await act(async () => { vi.advanceTimersByTime(1) })
    expect(rpc).toHaveBeenCalledTimes(2)
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_kinds: ['file'], p_extension: 'pmp' })
  })

  it('loadMore pages by the last item’s (created_at, id) and appends', async () => {
    const page1 = Array.from({ length: 60 }, (_, i) => item(100 - i))
    rpc.mockResolvedValueOnce({ data: page1, error: null }).mockResolvedValueOnce({ data: [item(1)], error: null })
    const { result } = renderHook(() => useMediaGallery(base))
    await waitFor(() => expect(result.current.items).toHaveLength(60))
    expect(result.current.hasMore).toBe(true)

    act(() => result.current.loadMore())
    await waitFor(() => expect(result.current.items).toHaveLength(61))
    const last = page1[59]
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_before: last.created_at, p_before_id: last.id })
    expect(result.current.hasMore).toBe(false)
  })

  it('a filter change resets the list', async () => {
    rpc.mockResolvedValueOnce({ data: [item(1), item(2)], error: null })
    const d = deferred()
    rpc.mockReturnValueOnce(d.promise)
    const { result, rerender } = renderHook((o: MediaGalleryOptions) => useMediaGallery(o), { initialProps: base })
    await waitFor(() => expect(result.current.items).toHaveLength(2))

    rerender({ ...base, kind: 'links' })
    await waitFor(() => expect(result.current.items).toHaveLength(0))
    expect(result.current.loading).toBe(true)
    await act(async () => d.resolve({ data: [item(3, 'link')], error: null }))
    expect(result.current.items.map((i) => i.kind)).toEqual(['link'])
  })

  it('ignores a stale response that arrives after a newer one', async () => {
    const slow = deferred()
    const fast = deferred()
    rpc.mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise)
    const { result, rerender } = renderHook((o: MediaGalleryOptions) => useMediaGallery(o), { initialProps: base })
    rerender({ ...base, kind: 'files' })
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2))

    await act(async () => fast.resolve({ data: [item(2, 'file')], error: null }))
    await act(async () => slow.resolve({ data: [item(1, 'image')], error: null }))
    expect(result.current.items.map((i) => i.kind)).toEqual(['file'])
    expect(result.current.loading).toBe(false)
  })

  it('a loadMore answer is dropped when the filters changed meanwhile', async () => {
    const page1 = Array.from({ length: 60 }, (_, i) => item(100 - i))
    const more = deferred()
    rpc
      .mockResolvedValueOnce({ data: page1, error: null })
      .mockReturnValueOnce(more.promise)
      .mockResolvedValueOnce({ data: [item(5, 'link')], error: null })
    const { result, rerender } = renderHook((o: MediaGalleryOptions) => useMediaGallery(o), { initialProps: base })
    await waitFor(() => expect(result.current.items).toHaveLength(60))
    act(() => result.current.loadMore())
    rerender({ ...base, kind: 'links' })
    await waitFor(() => expect(result.current.items.map((i) => i.kind)).toEqual(['link']))
    await act(async () => more.resolve({ data: [item(1)], error: null }))
    expect(result.current.items.map((i) => i.kind)).toEqual(['link'])
  })

  it('loadMore does nothing while a page is loading or when there is no more', async () => {
    rpc.mockResolvedValueOnce({ data: [item(1)], error: null })
    const { result } = renderHook(() => useMediaGallery(base))
    await waitFor(() => expect(result.current.items).toHaveLength(1))
    act(() => result.current.loadMore())
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('reports an error and keeps going', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'nope' } })
    const { result } = renderHook(() => useMediaGallery(base))
    await waitFor(() => expect(result.current.error).toBe('nope'))
    expect(result.current.items).toEqual([])
    expect(result.current.loading).toBe(false)
  })

  it('takes a page size from limit', async () => {
    rpc.mockResolvedValue({ data: [item(1), item(2)], error: null })
    const { result } = renderHook(() => useMediaGallery({ ...base, limit: 2 }))
    await waitFor(() => expect(result.current.items).toHaveLength(2))
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_limit: 2 })
    expect(result.current.hasMore).toBe(true)
  })

  it('does nothing while disabled, and fetches once enabled', async () => {
    const { result, rerender } = renderHook((o: MediaGalleryOptions) => useMediaGallery(o), {
      initialProps: { ...base, enabled: false },
    })
    await act(async () => {})
    expect(rpc).not.toHaveBeenCalled()
    expect(result.current.loading).toBe(false)
    expect(result.current.items).toEqual([])

    rpc.mockResolvedValue({ data: [item(1)], error: null })
    rerender({ ...base, enabled: true })
    await waitFor(() => expect(result.current.items).toHaveLength(1))
  })

  it('clears its items when disabled again', async () => {
    rpc.mockResolvedValue({ data: [item(1)], error: null })
    const { result, rerender } = renderHook((o: MediaGalleryOptions) => useMediaGallery(o), { initialProps: base })
    await waitFor(() => expect(result.current.items).toHaveLength(1))
    rerender({ ...base, enabled: false })
    await waitFor(() => expect(result.current.items).toEqual([]))
  })

  it('fills in each item’s author with one messages query per page', async () => {
    rpc.mockResolvedValue({ data: [item(1), item(2)], error: null })
    const { result } = renderHook(() => useMediaGallery(base))
    await waitFor(() => expect(result.current.items).toHaveLength(2))
    expect(from).toHaveBeenCalledWith('messages')
    expect(inIds).toHaveBeenCalledTimes(1)
    expect(inIds).toHaveBeenCalledWith('id', ['m-1', 'm-2'])
    expect(result.current.items.map((i) => i.author_id)).toEqual(['author-of-m-1', 'author-of-m-2'])
  })

  it('still shows the page when the author lookup fails', async () => {
    rpc.mockResolvedValue({ data: [item(1)], error: null })
    inIds.mockImplementation(async () => ({ data: null, error: { message: 'nope' } }))
    const { result } = renderHook(() => useMediaGallery(base))
    await waitFor(() => expect(result.current.items).toHaveLength(1))
    expect(result.current.items[0].author_id).toBeUndefined()
    expect(result.current.error).toBeNull()
  })

  it('retry repeats a failed first page', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'nope' } }).mockResolvedValueOnce({ data: [item(1)], error: null })
    const { result } = renderHook(() => useMediaGallery(base))
    await waitFor(() => expect(result.current.error).toBe('nope'))
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.items).toHaveLength(1))
    expect(result.current.error).toBeNull()
  })

  it('retry repeats a failed later page, keeping what was loaded', async () => {
    const page1 = Array.from({ length: 60 }, (_, i) => item(100 - i))
    rpc
      .mockResolvedValueOnce({ data: page1, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'nope' } })
      .mockResolvedValueOnce({ data: [item(1)], error: null })
    const { result } = renderHook(() => useMediaGallery(base))
    await waitFor(() => expect(result.current.items).toHaveLength(60))
    act(() => result.current.loadMore())
    await waitFor(() => expect(result.current.error).toBe('nope'))
    expect(result.current.items).toHaveLength(60)
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.items).toHaveLength(61))
    expect(rpc.mock.calls[2][1]).toMatchObject({ p_before_id: page1[59].id })
    expect(result.current.error).toBeNull()
  })
})
