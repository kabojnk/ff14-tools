/** What the file input offers. On iPhones this also has the photo picker convert HEIC to JPEG. */
export const EMOJI_ACCEPT = 'image/png,image/jpeg,image/gif,image/webp'
const TYPES = new Set(EMOJI_ACCEPT.split(','))
const MB = 1024 * 1024
/** Still pictures are cropped down to a 128×128 PNG, so only the server's limit applies. */
const MAX_STILL = 25 * MB
/** GIFs upload as they are (animated), so they stay small. */
const MAX_GIF = 2 * MB

/** null when the file can be used; otherwise the message to show. */
export function emojiFileError(file: File): string | null {
  if (!TYPES.has(file.type)) return 'Choose a PNG, JPG, GIF or WebP picture.'
  if (file.type === 'image/gif') return file.size > MAX_GIF ? 'GIFs can be up to 2 MB.' : null
  return file.size > MAX_STILL ? 'Pictures can be up to 25 MB.' : null
}
