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

/**
 * The info panel's media gallery through get_media: newest first, keyset paged by (created_at, id).
 * Any filter change resets the list; answers to superseded requests are dropped.
 */
export function useMediaGallery({ conversationId, space, scope, kind, extension }: MediaGalleryOptions) {
  const ext = useDebounced(normalizeExtension(extension), EXTENSION_DEBOUNCE_MS)
  const [state, setState] = useState<GalleryState>({ items: [], loading: true, hasMore: false, error: null })
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
      setState((s) => (after ? { ...s, loading: true } : { items: [], loading: true, hasMore: false, error: null }))
      const { data, error } = await supabase.rpc('get_media', {
        ...params,
        p_before: after?.created_at ?? null,
        p_before_id: after?.id ?? null,
        p_limit: MEDIA_PAGE_SIZE,
      })
      if (id !== requestRef.current) return
      const rows = (data ?? []) as MediaItem[]
      setState((s) => ({
        items: after ? [...s.items, ...rows] : rows,
        loading: false,
        hasMore: !error && rows.length === MEDIA_PAGE_SIZE,
        error: error?.message ?? null,
      }))
    },
    [params],
  )

  useEffect(() => {
    void fetchPage(null)
  }, [fetchPage])

  const loadMore = useCallback(() => {
    const { loading, hasMore, items } = stateRef.current
    if (loading || !hasMore || items.length === 0) return
    void fetchPage(items[items.length - 1])
  }, [fetchPage])

  return { ...state, loadMore }
}
