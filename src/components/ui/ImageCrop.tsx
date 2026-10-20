import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Image as ImageIcon } from 'lucide-react'
import { Sheet } from '@/components/ui/Sheet'
import { Icon } from '@/components/ui/Icon'
import { clampOffset, cropFileName, cropRect, type CropType } from '@/lib/crop'

type Size = { w: number; h: number }
type Point = { x: number; y: number }

const MIN_ZOOM = 1
const MAX_ZOOM = 4
const OPEN_ERROR = "Couldn't open this image."
const EXPORT_ERROR = "Couldn't crop this image."

interface ImageCropProps {
  file: File
  /** Width ÷ height of the crop frame: 1 for avatars and emoji, 4 for banners. */
  aspect: number
  /** Exported size in px. */
  output: { width: number; height: number }
  /** 'image/png' for emoji (keeps transparency), 'image/jpeg' for photos. */
  type: CropType
  /** Previews drawn under the frame, as sizes in px or { size, label }, e.g. [16, 22, 44] for emoji. */
  previews?: (number | { size: number; label: string })[]
  /** The sheet's title. Default "Crop". */
  title?: string
  /** The header's leading button (it calls `onCancel`). Default 'cancel'. */
  leading?: 'cancel' | 'back'
  /** The header's action label. Default "Done". */
  doneLabel?: string
  /** The output's file name. Default from `cropFileName(type, aspect)`. */
  fileName?: string
  /** The line under the frame. */
  hint?: string
  onCancel: () => void
  onDone: (cropped: File) => void
  /** Called with a user-facing message when the image can't be opened or exported; the caller shows it. */
  onError?: (message: string) => void
}

/**
 * Crop a picture to a fixed aspect ratio (design §11), in its own `Sheet` (stack it over the
 * caller's). Drag to move (pointer capture), pinch, wheel or the Zoom slider for 1×–4×; the image
 * always covers the frame. The file is decoded once into an `<img>` (which honours EXIF
 * orientation), and that one element supplies the size, the preview and the export.
 *
 * Animated GIFs aren't cropped: callers check `file.type === 'image/gif'` and skip this.
 */
export function ImageCrop({
  file,
  aspect,
  output,
  type,
  previews = [],
  title = 'Crop',
  leading = 'cancel',
  doneLabel = 'Done',
  fileName,
  hint = 'Drag to move, pinch or slide to zoom.',
  onCancel,
  onDone,
  onError,
}: ImageCropProps) {
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [zoom, setZoom] = useState(1)
  // As a fraction of the frame, so a resize (rotation) keeps the same crop.
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 })
  const [measured, setMeasured] = useState<Size>({ w: 0, h: 0 })
  const frameRef = useRef<HTMLDivElement>(null)
  const areaRef = useRef<HTMLDivElement>(null)
  const pointers = useRef(new Map<number, Point>())
  const gesture = useRef<{ offset: Point; zoom: number; start: Point; dist: number } | null>(null)
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError

  const fail = (message: string) => {
    setError(message)
    onErrorRef.current?.(message)
  }

  // Decode once.
  useEffect(() => {
    let cancelled = false
    const url = URL.createObjectURL(file)
    const el = new Image()
    el.src = url
    el.decode()
      .then(() => {
        if (!el.naturalWidth || !el.naturalHeight) throw new Error('empty image')
        if (!cancelled) setImg(el)
      })
      .catch(() => {
        if (!cancelled) {
          setError(OPEN_ERROR)
          onErrorRef.current?.(OPEN_ERROR)
        }
      })
    return () => {
      cancelled = true
      URL.revokeObjectURL(url)
    }
  }, [file])

  useLayoutEffect(() => {
    const el = frameRef.current
    if (!el) return
    const measure = () => setMeasured({ w: el.clientWidth, h: el.clientHeight })
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Before layout (and in tests) the frame has no size; the output has the same shape.
  const frame: Size = measured.w && measured.h ? measured : { w: output.width, h: output.height }
  const natural: Size | null = img ? { w: img.naturalWidth, h: img.naturalHeight } : null
  const toPx = (o: Point): Point => ({ x: o.x * frame.w, y: o.y * frame.h })
  const toFraction = (o: Point): Point => ({ x: o.x / frame.w, y: o.y / frame.h })
  const rect = natural ? cropRect(natural, frame, zoom, toPx(offset)) : null

  const apply = (nextZoom: number, nextOffsetPx: Point) => {
    if (!natural) return
    const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextZoom))
    setZoom(z)
    setOffset(toFraction(clampOffset(natural, frame, z, nextOffsetPx)))
  }
  // Zoom about the frame's centre: the point in the middle stays put.
  const zoomTo = (z: number) => {
    const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z))
    const px = toPx(offset)
    apply(clamped, { x: (px.x * clamped) / zoom, y: (px.y * clamped) / zoom })
  }
  const zoomToRef = useRef(zoomTo)
  zoomToRef.current = zoomTo

  // Wheel zoom on desktop; non-passive so the sheet doesn't scroll as well.
  useEffect(() => {
    const el = areaRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      zoomToRef.current(zoomRef.current * Math.exp(-e.deltaY * 0.002))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom

  const startGesture = () => {
    const pts = [...pointers.current.values()]
    const centre = pts.reduce((a, p) => ({ x: a.x + p.x / pts.length, y: a.y + p.y / pts.length }), { x: 0, y: 0 })
    const dist = pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0
    gesture.current = { offset: toPx(offset), zoom, start: centre, dist }
  }

  const onPointerDown = (e: ReactPointerEvent) => {
    if (!natural) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    startGesture()
  }

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const pts = [...pointers.current.values()]
    const centre = pts.reduce((a, p) => ({ x: a.x + p.x / pts.length, y: a.y + p.y / pts.length }), { x: 0, y: 0 })
    const g = gesture.current
    const z =
      pts.length > 1 && g.dist > 0
        ? Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, (g.zoom * Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)) / g.dist))
        : g.zoom
    const ratio = z / g.zoom
    apply(z, {
      x: g.offset.x * ratio + (centre.x - g.start.x),
      y: g.offset.y * ratio + (centre.y - g.start.y),
    })
  }

  const onPointerUp = (e: ReactPointerEvent) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size) startGesture()
    else gesture.current = null
  }

  const exportCrop = async () => {
    if (!img || !rect || busy) return
    setBusy(true)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = output.width
      canvas.height = output.height
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('no 2d context')
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, output.width, output.height)
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.9))
      if (!blob) throw new Error('toBlob returned null')
      onDone(new File([blob], fileName ?? cropFileName(type, aspect), { type }))
    } catch {
      fail(EXPORT_ERROR)
    } finally {
      setBusy(false)
    }
  }

  // Where the image sits relative to the frame, in frame pixels.
  const drawn = rect && natural ? { scale: frame.w / rect.sw, left: (-rect.sx * frame.w) / rect.sw, top: (-rect.sy * frame.w) / rect.sw } : null

  return (
    <Sheet
      title={title}
      leading={leading}
      onClose={onCancel}
      action={{ label: doneLabel, onClick: () => void exportCrop(), disabled: !img || busy }}
    >
      <div
        ref={areaRef}
        data-crop-area=""
        className="relative mx-3.5 mt-3 overflow-hidden rounded-xl bg-black"
        style={{ aspectRatio: String(aspect), touchAction: 'none', cursor: img ? 'grab' : 'default' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div ref={frameRef} className="absolute inset-[8%]">
          {img && drawn && natural && (
            <img
              src={img.src}
              alt=""
              draggable={false}
              className="pointer-events-none absolute max-w-none select-none"
              style={{ left: drawn.left, top: drawn.top, width: natural.w * drawn.scale, height: natural.h * drawn.scale }}
            />
          )}
          {/* The frame: shade outside it, a white border and thirds inside. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-md border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,.45)]"
          >
            <div className="absolute inset-x-0 top-1/3 h-1/3 border-y border-white/35" />
          </div>
        </div>
        {!img && (
          <div className="absolute inset-0 grid place-items-center px-4 text-center text-sm text-white/70">
            {error ?? 'Loading…'}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 px-4 pb-0.5 pt-2 text-[color:var(--muted)]">
        <Icon icon={ImageIcon} size={14} />
        <input
          type="range"
          aria-label="Zoom"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={0.01}
          value={zoom}
          disabled={!img}
          onChange={(e) => zoomTo(Number(e.target.value))}
          className="h-1 flex-1 cursor-pointer accent-[color:var(--accent)]"
        />
        <Icon icon={ImageIcon} size={20} />
      </div>

      {previews.length > 0 && (
        <div className="flex items-end gap-3.5 px-4 py-1.5 text-[11px] text-[color:var(--muted)]">
          {previews.map((p, i) => {
            const size = typeof p === 'number' ? p : p.size
            const label = typeof p === 'number' ? `${p} px` : p.label
            const k = rect ? size / rect.sw : 0
            return (
              <figure key={i} className="m-0 flex flex-col items-center gap-1">
                <span
                  data-crop-preview=""
                  className="relative block overflow-hidden rounded-[3px] bg-[color:var(--seg)]"
                  style={{ width: size, height: size / aspect }}
                >
                  {img && rect && natural && (
                    <img
                      src={img.src}
                      alt=""
                      draggable={false}
                      className="absolute max-w-none"
                      style={{ left: -rect.sx * k, top: -rect.sy * k, width: natural.w * k, height: natural.h * k }}
                    />
                  )}
                </span>
                {label}
              </figure>
            )
          })}
        </div>
      )}

      {error && img ? (
        <p role="alert" className="px-4 pt-1 text-[11px] text-[color:var(--danger)]">
          {error}
        </p>
      ) : (
        <p className="px-4 pt-0.5 text-[11px] leading-[1.45] text-[color:var(--muted)]">{hint}</p>
      )}
    </Sheet>
  )
}
