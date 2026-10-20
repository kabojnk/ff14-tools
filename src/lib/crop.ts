/** Pure crop maths for `ImageCrop`. */

type Size = { w: number; h: number }
type Point = { x: number; y: number }
export type CropType = 'image/png' | 'image/jpeg'

/** How much larger than "just covers the frame" the image is drawn. */
const coverScale = (natural: Size, frame: Size, zoom: number) =>
  Math.max(frame.w / natural.w, frame.h / natural.h) * zoom

/**
 * Keeps the image covering the frame. `offset` is how far (in frame pixels) the image's centre sits
 * from the frame's centre; it can move at most half the overflow each way.
 */
export function clampOffset(natural: Size, frame: Size, zoom: number, offset: Point): Point {
  const scale = coverScale(natural, frame, zoom)
  const maxX = Math.max(0, (natural.w * scale - frame.w) / 2)
  const maxY = Math.max(0, (natural.h * scale - frame.h) / 2)
  const clamp = (v: number, m: number) => Math.max(-m, Math.min(m, v)) + 0 // + 0 turns -0 into 0
  return { x: clamp(offset.x, maxX), y: clamp(offset.y, maxY) }
}

/**
 * The source rectangle (in the image's natural pixels) that the frame shows, for `drawImage`.
 * At zoom 1 the image just covers the frame; zoom 2 halves the source size. The offset is clamped.
 */
export function cropRect(natural: Size, frame: Size, zoom: number, offset: Point) {
  const scale = coverScale(natural, frame, zoom)
  const o = clampOffset(natural, frame, zoom, offset)
  const left = (frame.w - natural.w * scale) / 2 + o.x
  const top = (frame.h - natural.h * scale) / 2 + o.y
  // `0 - x` rather than `-x`, so a zero edge is 0, not -0.
  return { sx: 0 - left / scale, sy: 0 - top / scale, sw: frame.w / scale, sh: frame.h / scale }
}

/**
 * The exported file's name. `upload-media` takes the extension from it: a PNG is an emoji, a wide
 * JPEG a banner, any other JPEG an avatar.
 */
export function cropFileName(type: CropType, aspect: number): string {
  if (type === 'image/png') return 'emoji.png'
  return aspect > 1 ? 'banner.jpg' : 'avatar.jpg'
}
