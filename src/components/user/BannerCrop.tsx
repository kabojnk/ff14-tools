import { useRef, useState, useEffect } from 'react'

interface BannerCropProps {
  file: File
  onSave: (cropped: File) => Promise<void>
  onCancel: () => void
}

// 4:1 matches the banner's display aspect ratio in both profile cards
const RATIO = 4
const EXPORT_WIDTH = 960
const EXPORT_HEIGHT = 240

export function BannerCrop({ file, onSave, onCancel }: BannerCropProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [imgSrc, setImgSrc] = useState<string | null>(null)
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 })
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 })
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [saving, setSaving] = useState(false)
  const dragRef = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null)
  const initializedRef = useRef(false)

  useEffect(() => {
    const url = URL.createObjectURL(file)
    setImgSrc(url)
    // Use createImageBitmap so we never touch the blob URL in JS —
    // the <img> tag handles its own loading and is unaffected by StrictMode cleanup timing.
    let cancelled = false
    createImageBitmap(file).then((bm) => {
      if (!cancelled) setNaturalSize({ w: bm.width, h: bm.height })
      bm.close()
    })
    return () => {
      cancelled = true
      URL.revokeObjectURL(url)
    }
  }, [file])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      setContainerSize({ w: entry.contentRect.width, h: entry.contentRect.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Center image within crop area on first load
  useEffect(() => {
    if (!naturalSize.w || !containerSize.w || initializedRef.current) return
    const sc = Math.max(containerSize.w / naturalSize.w, containerSize.h / naturalSize.h)
    const rw = naturalSize.w * sc
    const rh = naturalSize.h * sc
    setOffset({
      x: Math.min(0, (containerSize.w - rw) / 2),
      y: Math.min(0, (containerSize.h - rh) / 2),
    })
    initializedRef.current = true
  }, [naturalSize, containerSize])

  // Scale to cover and compute drag bounds
  const scale = naturalSize.w && containerSize.w
    ? Math.max(containerSize.w / naturalSize.w, containerSize.h / naturalSize.h)
    : 1
  const renderedW = naturalSize.w * scale
  const renderedH = naturalSize.h * scale
  const minX = Math.min(0, containerSize.w - renderedW)
  const minY = Math.min(0, containerSize.h - renderedH)

  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
  const cx = clamp(offset.x, minX, 0)
  const cy = clamp(offset.y, minY, 0)

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { startX: e.clientX, startY: e.clientY, ox: cx, oy: cy }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return
    const { startX, startY, ox, oy } = dragRef.current
    setOffset({
      x: clamp(ox + (e.clientX - startX), minX, 0),
      y: clamp(oy + (e.clientY - startY), minY, 0),
    })
  }

  const onPointerUp = () => { dragRef.current = null }

  const handleSave = async () => {
    if (!naturalSize.w || !containerSize.w) return
    setSaving(true)
    try {
      // Use the original File directly — no blob URL required, no callback pyramid.
      const bitmap = await createImageBitmap(file)
      const sx = -cx / scale
      const sy = -cy / scale
      const sw = containerSize.w / scale
      const sh = containerSize.h / scale

      const canvas = document.createElement('canvas')
      canvas.width = EXPORT_WIDTH
      canvas.height = EXPORT_HEIGHT
      canvas.getContext('2d')!.drawImage(bitmap, sx, sy, sw, sh, 0, 0, EXPORT_WIDTH, EXPORT_HEIGHT)
      bitmap.close()

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.9),
      )
      if (blob) await onSave(new File([blob], 'banner.jpg', { type: 'image/jpeg' }))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-black/90 p-6">
      <div className="w-full max-w-xl">
        <h3 className="mb-1 text-center text-base font-semibold text-white">Crop Banner</h3>
        <p className="mb-4 text-center text-sm text-white/50">Drag to reposition</p>

        {/* 4:1 crop preview */}
        <div
          ref={containerRef}
          className="relative w-full overflow-hidden rounded-lg bg-[#1e1e1e]"
          style={{ aspectRatio: `${RATIO} / 1`, cursor: saving ? 'default' : 'grab', touchAction: 'none' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {imgSrc && naturalSize.w > 0 && containerSize.w > 0 ? (
            <img
              src={imgSrc}
              alt=""
              draggable={false}
              style={{
                position: 'absolute',
                left: cx,
                top: cy,
                width: renderedW,
                height: renderedH,
                userSelect: 'none',
                pointerEvents: 'none',
              }}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <span className="text-sm text-white/30">Loading…</span>
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-[3px] px-4 py-2 text-sm font-medium text-white/60 transition-colors hover:text-white"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !naturalSize.w}
            className="rounded-[3px] bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Crop & Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
