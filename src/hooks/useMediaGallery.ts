import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { normalizeExtension } from '@/lib/spaces'
import { kindsFor, type MediaFilterKind, type MediaScope } from '@/lib/media'
import type { MediaItem, Space } from '@/types'

export interface MediaGalleryOptions {
  conversationId: string
  space: Space
  scope: MediaScope
  kind: MediaFilterKind
  /** Raw text from the extension box; normalised and debounced here. */
  extension: string
  /** Page size (default MEDIA_PAGE_SIZE). */
  limit?: number
  /** False: no requests, and an empty, settled list (default true). */
  enabled?: boolean
}

interface GalleryState {
  items: MediaItem[]
  loading: boolean
  hasMore: boolean
  error: string | null
}

export const MEDIA_PAGE_SIZE = 60
export const EXTENSION_DEBOUNCE_MS = 300

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

/** get_media rows carry no sender: one messages query per page fills in author_id. A failure leaves it unset. */
async function withAuthors(rows: MediaItem[]): Promise<MediaItem[]> {
  if (rows.length === 0) return rows
  const ids = [...new Set(rows.map((r) => r.message_id))]
  const { data, error } = await supabase.from('messages').select('id, author_id').in('id', ids)
  if (error || !data) return rows
  const authors = new Map((data as { id: string; author_id: string }[]).map((m) => [m.id, m.author_id]))
  return rows.map((r) => (authors.has(r.message_id) ? { ...r, author_id: authors.get(r.message_id) } : r))
}

/**
 * The info panel's media gallery through get_media: newest first, keyset paged by (created_at, id).
 * Any filter change resets the list; answers to superseded requests are dropped.
 */
export function useMediaGallery({
  conversationId,
  space,
  scope,
  kind,
  extension,
  limit = MEDIA_PAGE_SIZE,
  enabled = true,
}: MediaGalleryOptions) {
  const ext = useDebounced(normalizeExtension(extension), EXTENSION_DEBOUNCE_MS)
  const [state, setState] = useState<GalleryState>({ items: [], loading: enabled, hasMore: false, error: null })
  const stateRef = useRef(state)
  stateRef.current = state
  const requestRef = useRef(0)

  const pSpace = scope === 'both' ? null : space
  const kinds = kindsFor(kind, ext)
  const kindsKey = kinds?.join(',') ?? null
  const params = useMemo(
    () => ({
      p_conversation: conversationId,
      p_space: pSpace,
      p_kinds: kindsKey === null ? null : kindsKey.split(','),
      p_extension: ext,
    }),
    [conversationId, pSpace, kindsKey, ext],
  )

  const fetchPage = useCallback(
    async (after: MediaItem | null) => {
      const id = ++requestRef.current
      setState((s) => (after ? { ...s, loading: true, error: null } : { items: [], loading: true, hasMore: false, error: null }))
      const { data, error } = await supabase.rpc('get_media', {
        ...params,
        p_before: after?.created_at ?? null,
        p_before_id: after?.id ?? null,
        p_limit: limit,
      })
      if (id !== requestRef.current) return
      const rows = error ? [] : await withAuthors((data ?? []) as MediaItem[])
      if (id !== requestRef.current) return
      setState((s) => ({
        items: after ? [...s.items, ...rows] : rows,
        loading: false,
        // A failed later page keeps hasMore, so retry() can ask for it again.
        hasMore: error ? after !== null && s.hasMore : rows.length === limit,
        error: error?.message ?? null,
      }))
    },
    [params, limit],
  )

  useEffect(() => {
    if (enabled) {
      void fetchPage(null)
      return
    }
    requestRef.current++
    setState({ items: [], loading: false, hasMore: false, error: null })
  }, [fetchPage, enabled])

  const loadMore = useCallback(() => {
    const { loading, hasMore, items, error } = stateRef.current
    if (!enabled || loading || !hasMore || error || items.length === 0) return
    void fetchPage(items[items.length - 1])
  }, [fetchPage, enabled])

  /** Repeats the request that failed: the first page when nothing loaded, else the next page. */
  const retry = useCallback(() => {
    const { loading, items } = stateRef.current
    if (!enabled || loading) return
    void fetchPage(items.length === 0 ? null : items[items.length - 1])
  }, [fetchPage, enabled])

  return { ...state, loadMore, retry }
}
