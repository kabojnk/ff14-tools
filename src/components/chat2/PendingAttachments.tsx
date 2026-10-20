import { EyeOff, FileText, RotateCw, X } from 'lucide-react'
import { Icon } from '@/components/ui/Icon'
import type { PendingAttachment } from '@/stores/draftStore'

interface PendingAttachmentsProps {
  items: PendingAttachment[]
  onRemove: (id: string) => void
  onRetry: (id: string) => void
  onToggleSpoiler: (id: string) => void
}

const isMedia = (t: PendingAttachment['type']) => t === 'image' || t === 'gif' || t === 'video'

/**
 * The composer's tray: a removable thumbnail per file, a spinner while it uploads (uploadFile reports
 * no progress, so it's indeterminate), Retry when it failed, and a spoiler toggle for photos, videos
 * and GIFs.
 */
export function PendingAttachments({ items, onRemove, onRetry, onToggleSpoiler }: PendingAttachmentsProps) {
  if (items.length === 0) return null
  return (
    <ul aria-label="Attachments" className="flex gap-2 overflow-x-auto px-1 pb-2">
      {items.map((a) => (
        <li
          key={a.id}
          data-spoiler={a.spoiler}
          data-status={a.status}
          className="relative h-20 w-20 flex-none overflow-hidden rounded-[12px] border border-[color:var(--line)] bg-[color:var(--field)]"
        >
          <Thumb item={a} />

          {a.status === 'uploading' && (
            <div
              role="progressbar"
              aria-label={`Uploading ${a.filename}`}
              className="absolute inset-0 grid place-items-center bg-black/35"
            >
              <span className="h-7 w-7 animate-spin rounded-full border-[3px] border-white/30 border-t-white motion-reduce:animate-none" />
            </div>
          )}

          {a.status === 'failed' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/60 text-white">
              <span className="text-[11px] font-semibold">Upload failed</span>
              <button
                type="button"
                onClick={() => onRetry(a.id)}
                aria-label={`Retry ${a.filename}`}
                className="flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[11px] hover:bg-white/30"
              >
                <Icon icon={RotateCw} size={12} />
                Retry
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => onRemove(a.id)}
            aria-label={`Remove ${a.filename}`}
            className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80"
          >
            <Icon icon={X} size={14} />
          </button>

          {isMedia(a.type) && a.status !== 'failed' && (
            <button
              type="button"
              onClick={() => onToggleSpoiler(a.id)}
              aria-label={`Spoiler ${a.filename}`}
              aria-pressed={a.spoiler}
              title={a.spoiler ? 'Remove spoiler' : 'Mark as spoiler'}
              className={`absolute bottom-1 left-1 grid h-6 w-6 place-items-center rounded-full ${
                a.spoiler ? 'bg-[color:var(--accent)] text-[color:var(--on-accent)]' : 'bg-black/60 text-white hover:bg-black/80'
              }`}
            >
              <Icon icon={EyeOff} size={14} />
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

function Thumb({ item }: { item: PendingAttachment }) {
  const src = item.preview ?? item.uploaded?.url ?? null
  const blur = item.spoiler ? 'blur-md scale-110' : ''
  if (src && (item.type === 'image' || item.type === 'gif')) {
    return <img src={src} alt={item.filename} draggable={false} className={`h-full w-full object-cover ${blur}`} />
  }
  if (src && item.type === 'video') {
    return <video src={src} muted playsInline aria-label={item.filename} className={`h-full w-full object-cover ${blur}`} />
  }
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-1 text-center text-[10px] text-[color:var(--muted)]">
      <Icon icon={FileText} size={18} />
      <span className="line-clamp-2 break-all">{item.filename}</span>
    </div>
  )
}
