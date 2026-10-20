import { useEffect, useMemo, useRef, useState } from 'react'
import { FileText, ImageOff, Link2, Mic, Play } from 'lucide-react'
import { Icon } from '@/components/ui/Icon'
import { MediaFilters } from '@/components/chat/MediaFilters'
import { useMediaGallery } from '@/hooks/useMediaGallery'
import { createSerialQueue, formatDuration, formatItemDate, groupByMonth, linkLabel, type SerialQueue } from '@/lib/gallery'
import { formatSize, type MediaFilterKind, type MediaScope } from '@/lib/media'
import { SPACE_LABEL, normalizeExtension } from '@/lib/spaces'
import { useAuthStore } from '@/stores/authStore'
import { useProfileStore } from '@/stores/profileStore'
import type { MediaItem, Space } from '@/types'

export interface MediaGalleryProps {
  conversationId: string
  space: Space
  /** A thumbnail was tapped: its index among `visualItems` (every loaded photo, video and GIF, in gallery order). */
  onOpen: (index: number, visualItems: MediaItem[]) => void
  /** The scroll container the gallery sits in: the root for infinite scroll and for "in view". Null: the viewport. */
  scrollRoot?: Element | null
}

const VISUAL_KINDS = new Set<MediaItem['kind']>(['image', 'video', 'gif'])
const isVisual = (i: MediaItem) => VISUAL_KINDS.has(i.kind)
/** The "Without the filter" section shows when a filtered search finds fewer than this. */
const FALLBACK_BELOW = 3
/** A video whose metadata never arrives (iOS may wait for a tap) gives up its turn after this. */
const METADATA_TIMEOUT_MS = 8000

/**
 * "Media, files & links": the filters, then the items grouped by month: a 3-column grid of photos, videos and
 * GIFs, then file and link rows. With an extension filter the matches get a "1 file · .pmp" header, and fewer
 * than 3 matches bring in a dimmed "Without the filter" section. Scrolling to the end loads the next page.
 */
export function MediaGallery({ conversationId, space, onOpen, scrollRoot = null }: MediaGalleryProps) {
  const [kind, setKind] = useState<MediaFilterKind>('all')
  const [extension, setExtension] = useState('')
  const [scope, setScope] = useState<MediaScope>('space')
  const main = useMediaGallery({ conversationId, space, scope, kind, extension })
  const ext = normalizeExtension(extension)
  const fallback = useMediaGallery({
    conversationId,
    space,
    scope,
    // From All, an extension searches every kind; its "recent files" means files.
    kind: kind === 'all' ? 'files' : kind,
    extension: '',
    limit: 5,
    enabled: ext !== null && main.items.length < FALLBACK_BELOW,
  })
  const [queue] = useState(createSerialQueue)
  const now = new Date()

  const visual = useMemo(() => main.items.filter(isVisual), [main.items])
  const open = (item: MediaItem) => onOpen(visual.indexOf(item), visual)

  const fallbackItems = useMemo(() => {
    const shown = new Set(main.items.map((i) => i.id))
    return fallback.items.filter((i) => !shown.has(i.id))
  }, [fallback.items, main.items])
  const showFallback = ext !== null && !main.loading && !main.error && main.items.length < FALLBACK_BELOW && fallbackItems.length > 0

  const emptyLabel =
    kind === 'voice'
      ? 'No voice memos yet'
      : kind !== 'all' || extension.trim()
        ? 'Nothing matches these filters.'
        : scope === 'both'
          ? 'No media yet.'
          : 'No media in this space yet.'

  const sections =
    ext !== null
      ? [{ label: `${main.items.length} ${main.items.length === 1 ? 'file' : 'files'} · .${ext}`, items: main.items }]
      : groupByMonth(main.items, now)

  const thumb = (item: MediaItem, onClick: () => void, dim = false) => (
    <Thumb key={`${item.id}:${item.spoiler}`} item={item} onOpen={onClick} queue={queue} root={scrollRoot} dim={dim} />
  )
  const row = (item: MediaItem, dim = false) =>
    item.kind === 'link' ? <LinkRow key={item.id} item={item} now={now} dim={dim} /> : <FileRow key={item.id} item={item} now={now} dim={dim} />

  return (
    <div data-media-gallery className="flex flex-col">
      <MediaFilters
        kind={kind}
        onKindChange={setKind}
        extension={extension}
        onExtensionChange={setExtension}
        scope={scope}
        onScopeChange={setScope}
      />

      <div className="flex flex-col gap-1.5 px-2.5 pb-4 pt-1">
        {main.items.length === 0 ? (
          main.loading ? (
            <SkeletonGrid />
          ) : main.error ? (
            <ErrorLine onRetry={main.retry} />
          ) : (
            <p className="py-16 text-center text-sm text-[color:var(--muted)]">{emptyLabel}</p>
          )
        ) : (
          sections.map((section) => {
            const v = section.items.filter(isVisual)
            const rows = section.items.filter((i) => !isVisual(i))
            return (
              <section key={section.label} className="flex flex-col gap-1.5">
                <SectionHeader>{section.label}</SectionHeader>
                {v.length > 0 && <div className="grid grid-cols-3 gap-[3px]">{v.map((i) => thumb(i, () => open(i)))}</div>}
                {rows.map((i) => row(i))}
              </section>
            )
          })
        )}

        {showFallback && (
          <section className="flex flex-col gap-1.5">
            <SectionHeader>Without the filter</SectionHeader>
            {fallbackItems.some(isVisual) && (
              <div className="grid grid-cols-3 gap-[3px]">
                {fallbackItems.filter(isVisual).map((i, index, all) => thumb(i, () => onOpen(index, all), true))}
              </div>
            )}
            {fallbackItems.filter((i) => !isVisual(i)).map((i) => row(i, true))}
          </section>
        )}

        {main.items.length > 0 && main.error && <ErrorLine onRetry={main.retry} />}
        {main.items.length > 0 && main.loading && <p className="py-3 text-center text-xs text-[color:var(--muted)]">Loading…</p>}
        {main.hasMore && !main.error && (
          <Sentinel root={scrollRoot} loading={main.loading} loadMore={main.loadMore} />
        )}
      </div>
    </div>
  )
}

/**
 * Calls loadMore while it's in view. The observer only reports changes, so a sentinel that stays in view
 * after a page arrives is caught by re-checking whenever loading goes false.
 */
function Sentinel({ root, loading, loadMore }: { root: Element | null; loading: boolean; loadMore: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { root, rootMargin: '0px 0px 400px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [root])

  useEffect(() => {
    if (inView && !loading) loadMore()
  }, [inView, loading, loadMore])

  return <div ref={ref} data-gallery-sentinel aria-hidden="true" className="h-px" />
}

function SectionHeader({ children }: { children: string }) {
  return (
    <h3 className="px-0.5 pt-1.5 text-[10.5px] font-bold uppercase tracking-[0.06em] text-[color:var(--muted)]">{children}</h3>
  )
}

function SkeletonGrid() {
  return (
    <div data-gallery-skeleton aria-label="Loading media" role="status" className="flex flex-col gap-1.5">
      <span className="mt-2 h-3 w-16 rounded bg-[color:var(--seg)] motion-safe:animate-pulse" />
      <div className="grid grid-cols-3 gap-[3px]">
        {Array.from({ length: 9 }, (_, i) => (
          <span key={i} className="aspect-square rounded bg-[color:var(--seg)] motion-safe:animate-pulse" />
        ))}
      </div>
    </div>
  )
}

function ErrorLine({ onRetry }: { onRetry: () => void }) {
  return (
    <p className="flex items-center justify-center gap-2 py-6 text-sm text-[color:var(--muted)]">
      Couldn't load media.
      <button type="button" onClick={onRetry} className="font-semibold text-[color:var(--accent)] hover:underline">
        Retry
      </button>
    </p>
  )
}

interface ThumbProps {
  item: MediaItem
  onOpen: () => void
  queue: SerialQueue
  root: Element | null
  dim: boolean
}

/**
 * A square thumbnail. Photos and GIFs hold the chat's loading skeleton until they load and the "Couldn't load"
 * tile if they fail. A video's <video preload="metadata"> (its first frame and its duration) mounts only once
 * it's in view and its turn in the queue comes, so one video's metadata loads at a time.
 */
function Thumb({ item, onOpen, queue, root, dim }: ThumbProps) {
  const isVideo = item.kind === 'video'
  const [load, setLoad] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [videoTurn, setVideoTurn] = useState(false)
  const [duration, setDuration] = useState<number | null>(null)
  const ref = useRef<HTMLButtonElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const [key] = useState(() => ({}))

  useEffect(() => {
    // A cached image can finish before React attaches onLoad.
    const el = imgRef.current
    if (el?.complete) setLoad(el.naturalWidth > 0 ? 'loaded' : 'error')
  }, [])

  // Videos: ask for a turn while in view, and drop out of the line when scrolled away before the turn came.
  // Once started, a video keeps its turn until its metadata (or an error, or the timeout) arrives.
  const startedRef = useRef(false)
  useEffect(() => {
    const el = ref.current
    if (!isVideo || !el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (startedRef.current) return
        if (entry.isIntersecting)
          queue.request(key, () => {
            startedRef.current = true
            setVideoTurn(true)
          })
        else queue.cancel(key)
      },
      { root },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [isVideo, queue, key, root])
  useEffect(() => () => queue.cancel(key), [queue, key])

  useEffect(() => {
    if (!videoTurn || load !== 'loading') return
    const t = setTimeout(() => {
      setLoad('loaded')
      queue.done(key)
    }, METADATA_TIMEOUT_MS)
    return () => clearTimeout(t)
  }, [videoTurn, load, queue, key])

  const finishVideo = (state: 'loaded' | 'error') => {
    setLoad(state)
    queue.done(key)
  }

  const blur = item.spoiler ? 'scale-110 blur-[16px] brightness-50' : ''
  const media = 'absolute inset-0 h-full w-full object-cover'
  const dimmed = dim ? 'opacity-45' : ''

  return (
    <button
      ref={ref}
      type="button"
      {...(dim ? { 'data-media-fallback': item.kind } : { 'data-media-item': item.kind })}
      data-spoiler={item.spoiler ? '' : undefined}
      data-media-state={load}
      aria-label={load === 'error' ? undefined : `Open ${item.filename ?? item.kind}`}
      disabled={load === 'error'}
      onClick={onOpen}
      className={`relative aspect-square overflow-hidden rounded bg-black/20 text-white ${dimmed}`}
    >
      {load === 'error' ? (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-2 text-center text-[color:var(--muted)]">
          <Icon icon={ImageOff} size={20} strokeWidth={1.5} />
          <span className="text-[11px] font-semibold">Couldn't load</span>
          <span className="max-w-full truncate text-[10px] opacity-70">{item.filename}</span>
        </span>
      ) : (
        <>
          {load === 'loading' && <span data-media-skeleton aria-hidden="true" className="absolute inset-0 bg-[color:var(--seg)] motion-safe:animate-pulse" />}
          {isVideo ? (
            videoTurn && (
              <video
                src={item.url}
                preload="metadata"
                muted
                playsInline
                draggable={false}
                onLoadedMetadata={(e) => {
                  const d = e.currentTarget.duration
                  if (Number.isFinite(d)) setDuration(d)
                  finishVideo('loaded')
                }}
                onError={() => finishVideo('error')}
                className={`${media} ${blur}`}
              />
            )
          ) : (
            <img
              ref={imgRef}
              src={item.url}
              alt={item.filename ?? ''}
              loading="lazy"
              draggable={false}
              onLoad={() => setLoad('loaded')}
              onError={() => setLoad('error')}
              className={`${media} ${blur} ${load === 'loading' ? 'opacity-0' : ''}`}
            />
          )}
        </>
      )}

      {isVideo && load !== 'error' && (
        <>
          <span aria-hidden="true" className="pointer-events-none absolute bottom-1.5 left-1.5 drop-shadow">
            <Icon icon={Play} size={14} fill="currentColor" />
          </span>
          {duration !== null && (
            <span className="pointer-events-none absolute bottom-[5px] right-1.5 text-[10px] font-semibold [text-shadow:0_1px_2px_rgba(0,0,0,.5)]">
              {formatDuration(duration)}
            </span>
          )}
        </>
      )}
      {item.kind === 'gif' && load !== 'error' && (
        <span className="pointer-events-none absolute left-[5px] top-[5px] rounded-[3px] bg-black/45 px-1 py-px text-[9px] font-bold">GIF</span>
      )}
      {item.spoiler && load !== 'error' && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="rounded-full bg-black/60 px-2 py-0.5 text-[9px] font-bold tracking-wider">SPOILER</span>
        </span>
      )}
    </button>
  )
}

const rowClass = (dim: boolean) =>
  `flex items-center gap-2.5 rounded-[10px] border border-[color:var(--line)] bg-[color:var(--them)] p-2 no-underline transition-colors hover:border-[color:var(--muted)] ${dim ? 'opacity-45' : ''}`

function FileRow({ item, now, dim }: { item: MediaItem; now: Date; dim: boolean }) {
  const ext = (item.extension ?? '').toUpperCase().slice(0, 4)
  const meta = [formatSize(item.size), SPACE_LABEL[item.space], formatItemDate(item.created_at, now)].filter(Boolean).join(' · ')
  return (
    <a
      {...(dim ? { 'data-media-fallback': item.kind } : { 'data-media-item': item.kind })}
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className={rowClass(dim)}
    >
      <span className="relative grid h-[38px] w-[38px] flex-none place-items-center rounded-[9px] bg-[color:var(--seg)] text-[color:var(--muted)]">
        <Icon icon={item.kind === 'audio' ? Mic : FileText} size={18} />
        {ext && <span className="absolute bottom-[3px] text-[7.5px] font-extrabold leading-none text-[color:var(--accent)]">{ext}</span>}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[13px] font-semibold text-[color:var(--fg)]">{item.filename ?? item.url}</span>
        <span className="truncate text-[11px] text-[color:var(--muted)]">{meta}</span>
      </span>
    </a>
  )
}

function LinkRow({ item, now, dim }: { item: MediaItem; now: Date; dim: boolean }) {
  const myId = useAuthStore((s) => s.user?.id ?? null)
  const nickname = useProfileStore((s) => (item.author_id ? s.profiles[item.author_id]?.nickname : undefined))
  const who = item.author_id && item.author_id === myId ? 'you' : nickname
  const { site, address } = linkLabel(item.url)
  const meta = [address, who, formatItemDate(item.created_at, now)].filter(Boolean).join(' · ')
  return (
    <a
      {...(dim ? { 'data-media-fallback': item.kind } : { 'data-media-item': item.kind })}
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className={rowClass(dim)}
    >
      <span className="grid h-[38px] w-[38px] flex-none place-items-center rounded-[9px] bg-[color:var(--seg)] text-[color:var(--accent)]">
        <Icon icon={Link2} size={18} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[13px] font-semibold text-[color:var(--fg)]">{site}</span>
        <span className="truncate text-[11px] text-[color:var(--muted)]">{meta}</span>
      </span>
    </a>
  )
}
