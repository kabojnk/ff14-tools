import { useEffect, useRef, useState, type ReactNode } from 'react'
import { FileText, ImageOff, Play } from 'lucide-react'
import { Icon } from '@/components/ui/Icon'
import { MediaViewer } from '@/components/chat/MediaViewer'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { formatDuration } from '@/lib/gallery'
import { formatSize } from '@/lib/media'
import type { Attachment } from '@/types'

type Visual = Attachment & { type: 'image' | 'video' | 'gif' }

const isVisual = (a: Attachment): a is Visual => a.type === 'image' || a.type === 'video' || a.type === 'gif'

interface MediaBlockProps {
  messageId: string
  attachments: Attachment[]
  /** The bubble's time (media-only messages): shown on a scrim over the last visual item. */
  overlay?: ReactNode
}

const MAX_CELLS = 4

/**
 * A message's photos, videos, GIFs and files. A spoiler is blurred until tapped; the reveal is this
 * viewer's only and lives in component state, so the parent keys this block by the spoiler flags to
 * blur again when an item is re-marked.
 */
export function MediaBlock({ messageId, attachments, overlay }: MediaBlockProps) {
  const [revealed, setRevealed] = useState<ReadonlySet<number>>(() => new Set())
  const [viewer, setViewer] = useState<number | null>(null)

  const visual = attachments.map((a, index) => ({ a, index })).filter((x): x is { a: Visual; index: number } => isVisual(x.a))
  const files = attachments.map((a, index) => ({ a, index })).filter((x) => !isVisual(x.a))
  const shown = visual.slice(0, MAX_CELLS)
  const extra = visual.length - shown.length
  const hidden = (index: number) => attachments[index].spoiler && !revealed.has(index)
  const reveal = (index: number) => setRevealed((prev) => new Set(prev).add(index))
  const open = viewer === null ? null : attachments[viewer]

  return (
    <div data-media={messageId} className="flex flex-col gap-1">
      {shown.length > 0 && (
        <div
          data-media-grid={shown.length > 1 ? '' : undefined}
          className={`relative overflow-hidden rounded-[8px] ${shown.length > 1 ? 'grid grid-cols-2 gap-0.5' : ''}`}
        >
          {shown.map(({ a, index }, i) => (
            <MediaCell
              key={index}
              index={index}
              attachment={a}
              hidden={hidden(index)}
              single={shown.length === 1}
              wide={shown.length === 3 && i === 2}
              more={i === shown.length - 1 && extra > 0 ? extra : 0}
              onReveal={() => reveal(index)}
              onOpen={() => setViewer(index)}
            />
          ))}
          {overlay && (
            <div
              data-media-time
              className="pointer-events-none absolute bottom-1.5 right-1.5 rounded-full bg-black/45 px-1.5 py-px text-white [&_[data-meta]]:!m-0 [&_[data-meta]]:!text-white"
            >
              {overlay}
            </div>
          )}
        </div>
      )}

      {files.map(({ a, index }) => (
        <FileRow key={index} attachment={a} />
      ))}
      {overlay && shown.length === 0 && <div className="self-end">{overlay}</div>}

      {open && isVisual(open) && (
        <MediaViewer url={open.url} filename={open.filename} type={open.type} onClose={() => setViewer(null)} />
      )}
    </div>
  )
}

interface MediaCellProps {
  /** Its index in the message's attachments: what a long-press's spoiler action applies to. */
  index: number
  attachment: Visual
  hidden: boolean
  single: boolean
  wide: boolean
  /** "+N" on the last cell when there are more items than cells. */
  more: number
  onReveal: () => void
  onOpen: () => void
}

function MediaCell({ index, attachment: a, hidden, single, wide, more, onReveal, onOpen }: MediaCellProps) {
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  // Images hold a sized skeleton until they load, so the time and ticks have room; a failed load gets a
  // tile the same size. Videos only track failure: iOS may never load a video's metadata before a tap.
  const [load, setLoad] = useState<'loading' | 'loaded' | 'error'>(a.type === 'video' ? 'loaded' : 'loading')
  const imgRef = useRef<HTMLImageElement>(null)
  useEffect(() => {
    // A cached image can finish before React attaches onLoad.
    const el = imgRef.current
    if (el?.complete) setLoad(el.naturalWidth > 0 ? 'loaded' : 'error')
  }, [])
  const [duration, setDuration] = useState<number | null>(null)
  const [gifPlaying, setGifPlaying] = useState(false)
  const blur = hidden ? 'scale-110 blur-[24px] brightness-50' : ''
  const fit = single ? 'block max-h-80 w-full min-w-40 object-cover' : `block h-full w-full object-cover ${wide ? 'aspect-[2/1]' : 'aspect-square'}`
  // GIFs autoplay (an <img> loops by itself), except under reduced motion: then they wait for a tap.
  const gifPaused = a.type === 'gif' && reducedMotion && !gifPlaying
  const box = single ? 'h-36 w-60 max-w-full' : `w-full ${wide ? 'aspect-[2/1]' : 'aspect-square'}`
  const loading = load === 'loading' && !gifPaused

  return (
    <div
      data-media-index={index}
      data-spoiler={a.spoiler ? (hidden ? 'hidden' : 'revealed') : undefined}
      data-media-state={load}
      className={`relative overflow-hidden bg-black/20 ${wide ? 'col-span-2' : ''}`}
    >
      {load === 'error' ? (
        <div className={`${box} flex flex-col items-center justify-center gap-1 px-3 pb-5 text-center ${blur}`}>
          <Icon icon={ImageOff} size={24} strokeWidth={1.5} />
          <span className="text-xs font-semibold">Couldn't load</span>
          <span className="max-w-full truncate text-[11px] opacity-70">{a.filename}</span>
        </div>
      ) : a.type === 'video' ? (
        <video
          src={a.url}
          preload="metadata"
          muted
          playsInline
          draggable={false}
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration
            if (Number.isFinite(d)) setDuration(d)
          }}
          onError={() => setLoad('error')}
          className={`${fit} ${blur}`}
        />
      ) : gifPaused ? (
        <div className={`${fit} flex aspect-video items-center justify-center text-sm font-bold text-white/80`}>GIF</div>
      ) : (
        <>
          {loading && <div data-media-skeleton aria-hidden="true" className={`${box} motion-safe:animate-pulse`} />}
          <img
            ref={imgRef}
            src={a.url}
            alt={a.filename}
            loading="lazy"
            draggable={false}
            onLoad={() => setLoad('loaded')}
            onError={() => setLoad('error')}
            className={`${loading ? 'absolute inset-0 h-full w-full object-cover opacity-0' : fit} ${blur}`}
          />
        </>
      )}

      {a.type === 'video' && load !== 'error' && !hidden && (
        <span
          data-play-badge
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <span className="flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1.5 text-xs font-semibold text-white">
            <Icon icon={Play} size={14} fill="currentColor" />
            {duration !== null && formatDuration(duration)}
          </span>
        </span>
      )}

      {more > 0 && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/45 text-2xl font-bold text-white">
          +{more}
        </span>
      )}

      {hidden ? (
        <button type="button" aria-label="Show spoiler" onClick={stop(onReveal)} className="absolute inset-0 flex items-center justify-center">
          <span className="rounded-full bg-black/60 px-3 py-1 text-xs font-bold tracking-wider text-white">SPOILER</span>
        </button>
      ) : gifPaused ? (
        <button type="button" aria-label={`Play ${a.filename}`} onClick={stop(() => setGifPlaying(true))} className="absolute inset-0" />
      ) : load === 'error' ? null : (
        <button type="button" aria-label={`Open ${a.filename}`} onClick={stop(onOpen)} className="absolute inset-0" />
      )}
    </div>
  )
}

function FileRow({ attachment: a }: { attachment: Attachment }) {
  const dot = a.filename.lastIndexOf('.')
  const ext = dot > 0 ? a.filename.slice(dot + 1).toUpperCase().slice(0, 4) : ''
  return (
    <a
      href={a.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="flex min-w-48 items-center gap-2.5 rounded-[8px] bg-black/10 p-2 no-underline"
    >
      <span className="relative flex-none">
        <Icon icon={FileText} size={30} strokeWidth={1.5} />
        {ext && (
          <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 rounded-[3px] bg-[color:var(--accent)] px-0.5 text-[8px] font-bold leading-3 text-[color:var(--on-accent)]">
            {ext}
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{a.filename}</span>
        <span className="block text-xs opacity-70">{formatSize(a.size)}</span>
      </span>
    </a>
  )
}

const stop = (fn: () => void) => (e: { stopPropagation: () => void }) => {
  e.stopPropagation()
  fn()
}
