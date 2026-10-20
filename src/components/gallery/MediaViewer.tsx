import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { ChevronLeft, ChevronRight, Download, ImageOff, MessageCircle, X } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { Icon } from '@/components/ui/Icon'
import { Portal } from '@/components/ui/Portal'
import { DESKTOP_QUERY, useMediaQuery } from '@/hooks/useMediaQuery'
import { SPACE_LABEL } from '@/lib/spaces'
import { useAuthStore } from '@/stores/authStore'
import { useProfileStore } from '@/stores/profileStore'
import type { MediaKind, Space } from '@/types'

/** What the viewer shows: a gallery MediaItem fits as it is; the chat builds these from a message's attachments. */
export interface ViewerItem {
  /** Stable across re-renders and new pages: the viewer follows its item by id. */
  id: string
  url: string
  filename: string | null
  /** 'video' plays in a <video>; anything else shows as an image. */
  kind: MediaKind
  spoiler: boolean
  message_id?: string
  space?: Space
  created_at?: string
  author_id?: string
}

interface MediaViewerProps<T extends ViewerItem> {
  /** The loaded items, in order. The list may grow (new pages) or shrink (deletions) while open. */
  items: T[]
  /** The item opened. */
  index: number
  onClose: () => void
  /** Shows "Show in chat", called with the current item. */
  onShowInChat?: (item: T) => void
  /** More items exist beyond the loaded ones: reaching the last loaded item calls onLoadMore. */
  hasMore?: boolean
  /** A page is on its way: wait for it before asking again (a page may bring no photos, so ask again after). */
  loading?: boolean
  onLoadMore?: () => void
}

/** A horizontal move of more than this (px) is a swipe. */
const SWIPE_PX = 50

/**
 * Full-screen photo, video and GIF viewer: the sender and time on top, arrows and swipes to move (no wrap-around),
 * "4 of 23" and "Show in chat" below. Each item starts with its spoiler hidden; a video stops when you move on.
 */
export function MediaViewer<T extends ViewerItem>({ items, index, onClose, onShowInChat, hasMore = false, loading = false, onLoadMore }: MediaViewerProps<T>) {
  const isDesktop = useMediaQuery(DESKTOP_QUERY)
  const [currentId, setCurrentId] = useState(() => items[index]?.id ?? null)
  const lastPosRef = useRef(Math.max(0, index))
  const [revealedId, setRevealedId] = useState<string | null>(null)
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set())
  const closeRef = useRef<HTMLButtonElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const swipeRef = useRef<{ x: number; y: number; id: number } | null>(null)

  let pos = items.findIndex((i) => i.id === currentId)
  if (pos === -1 && items.length > 0) {
    // The item went away (deleted): the nearest one takes its place.
    pos = Math.min(lastPosRef.current, items.length - 1)
    setCurrentId(items[pos].id)
  }
  const current = pos >= 0 ? items[pos] : null
  useEffect(() => {
    if (pos >= 0) lastPosRef.current = pos
  }, [pos])

  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    if (items.length === 0) onCloseRef.current()
  }, [items.length])

  // Reaching the last loaded item asks for the next page.
  const onLoadMoreRef = useRef(onLoadMore)
  onLoadMoreRef.current = onLoadMore
  useEffect(() => {
    if (hasMore && !loading && pos >= 0 && pos === items.length - 1) onLoadMoreRef.current?.()
  }, [hasMore, loading, pos, items.length])

  // A playing video stops when it's left (its element goes away with the item).
  const currentKey = current?.id
  useEffect(() => {
    const video = videoRef.current
    return () => video?.pause()
  }, [currentKey])

  const go = (delta: number) => {
    const target = items[pos + delta]
    if (!target) return
    setCurrentId(target.id)
    // Every item starts hidden again, including one revealed earlier.
    setRevealedId(null)
  }
  const goRef = useRef(go)
  goRef.current = go

  // Focus moves in on open and back to where it was on close.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    return () => before?.focus?.()
  }, [])

  // Bubble phase on document, never stopping propagation: AppShell's double-Esc shortcut still hears it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || document.querySelector('[data-pin-pad]')) return
      if (e.key === 'Escape') onCloseRef.current()
      else if (e.key === 'ArrowLeft') goRef.current(-1)
      else if (e.key === 'ArrowRight') goRef.current(1)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const onPointerDown = (e: ReactPointerEvent) => {
    swipeRef.current = { x: e.clientX, y: e.clientY, id: e.pointerId }
  }
  const onPointerUp = (e: ReactPointerEvent) => {
    const start = swipeRef.current
    swipeRef.current = null
    if (!start || start.id !== e.pointerId) return
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1)
  }

  if (!current) return null
  const hidden = current.spoiler && revealedId !== current.id
  const blur = hidden ? 'scale-110 blur-[24px] brightness-50' : ''
  const media = `max-h-full max-w-full object-contain ${blur}`
  const label = current.filename ?? current.kind
  const fail = () => setFailed((prev) => new Set(prev).add(current.id))

  return (
    <Portal>
      <div role="dialog" aria-modal="true" aria-label="Media viewer" className="fixed inset-0 z-[60] flex flex-col bg-black text-white">
        <div className="pt-safe" />
        <Header item={current} closeRef={closeRef} onClose={onClose} />

        <div
          data-testid="viewer-stage"
          data-viewer-stage
          className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden"
          style={{ touchAction: 'pan-y' }}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={() => (swipeRef.current = null)}
        >
          {failed.has(current.id) ? (
            <div key={current.id} className="flex flex-col items-center justify-center gap-1 px-6 text-center text-white/70">
              <Icon icon={ImageOff} size={32} strokeWidth={1.5} />
              <span className="text-sm font-semibold">Couldn't load</span>
              <span className="max-w-full truncate text-xs opacity-70">{current.filename}</span>
            </div>
          ) : current.kind === 'video' ? (
            <video
              key={current.id}
              ref={videoRef}
              src={current.url}
              controls={!hidden}
              playsInline
              onError={fail}
              className={media}
            />
          ) : (
            <img key={current.id} src={current.url} alt={label} draggable={false} onError={fail} className={media} />
          )}

          {hidden && !failed.has(current.id) && (
            <button
              type="button"
              aria-label="Show spoiler"
              onClick={() => setRevealedId(current.id)}
              className="absolute inset-0 flex items-center justify-center"
            >
              <span className="rounded-full bg-black/60 px-3 py-1 text-sm font-bold tracking-wider">SPOILER</span>
            </button>
          )}

          <NavButton side="left" label="Previous" disabled={pos === 0} onClick={() => go(-1)} big={isDesktop} />
          <NavButton side="right" label="Next" disabled={pos === items.length - 1} onClick={() => go(1)} big={isDesktop} />
        </div>

        <div className="flex items-center justify-between gap-3 px-3.5 pb-[18px] pt-2.5 text-xs">
          <span data-testid="viewer-count" className="text-white/70">
            {pos + 1} of {items.length}
          </span>
          <span className="flex items-center gap-2">
            {isDesktop && (
              <a
                href={current.url}
                download={current.filename ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Download"
                title="Download"
                className="grid h-8 w-8 place-items-center rounded-full text-white/70 hover:bg-white/10 hover:text-white"
              >
                <Icon icon={Download} size={17} />
              </a>
            )}
            {onShowInChat && (
              <button
                type="button"
                onClick={() => onShowInChat(current)}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/[.16] px-3 py-[7px] text-[12.5px] font-semibold hover:bg-white/25"
              >
                <Icon icon={MessageCircle} size={15} />
                Show in chat
              </button>
            )}
          </span>
        </div>
        <div className="pb-safe" />
      </div>
    </Portal>
  )
}

function Header({ item, closeRef, onClose }: { item: ViewerItem; closeRef: React.RefObject<HTMLButtonElement>; onClose: () => void }) {
  const myId = useAuthStore((s) => s.user?.id ?? null)
  const myProfile = useAuthStore((s) => s.profile)
  const stored = useProfileStore((s) => (item.author_id ? s.profiles[item.author_id] : undefined))
  const author = stored ?? (item.author_id && item.author_id === myId ? myProfile : null) ?? null
  const when = item.created_at ? formatWhen(item.created_at) : null
  const sub = [item.space ? SPACE_LABEL[item.space] : null, when].filter(Boolean).join(' · ')

  return (
    <div className="flex items-center gap-2.5 px-3 py-2 text-xs">
      {author && <Avatar name={author.nickname} url={author.avatar_url} size={28} />}
      <span className="flex min-w-0 flex-col">
        {author && <b className="truncate text-[13px] font-semibold">{author.nickname}</b>}
        {sub && <small className="truncate text-xs text-white/65">{sub}</small>}
      </span>
      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="ml-auto grid h-9 w-9 place-items-center rounded-full text-white/80 hover:bg-white/10 hover:text-white"
      >
        <Icon icon={X} size={20} />
      </button>
    </div>
  )
}

function NavButton({ side, label, disabled, onClick, big }: { side: 'left' | 'right'; label: string; disabled: boolean; onClick: () => void; big: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      onPointerDown={(e) => e.stopPropagation()}
      className={`absolute top-1/2 grid -translate-y-1/2 place-items-center rounded-full bg-white/[.14] text-white transition-opacity hover:bg-white/25 disabled:pointer-events-none disabled:opacity-30 ${
        side === 'left' ? 'left-2' : 'right-2'
      } ${big ? 'h-10 w-10' : 'h-[30px] w-[30px]'}`}
    >
      <Icon icon={side === 'left' ? ChevronLeft : ChevronRight} size={big ? 22 : 16} />
    </button>
  )
}

/** "3 Oct, 9:14" (with the year outside the current one). */
function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const sameYear = d.getFullYear() === new Date().getFullYear()
  const date = d.toLocaleDateString([], { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return `${date}, ${time}`
}
