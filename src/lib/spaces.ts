import type { Space } from '@/types'

export const SPACES = ['main', 'schist'] as const satisfies readonly Space[]

export const SPACE_LABEL: Record<Space, string> = { main: 'Main', schist: 'Schist' }

export const spaceKey = (conversationId: string, space: Space) => `${conversationId}:${space}`

/**
 * Mirrors the SQL normalize_extension: trim, strip leading dots, lowercase.
 * ".ZIP", "zip", " .zip " → "zip"; ".tar.gz" → "tar.gz"; blank → null.
 */
export function normalizeExtension(input: string | null | undefined): string | null {
  // SQL btrim() strips spaces only, so this does too.
  const out = (input ?? '').replace(/^ +| +$/g, '').replace(/^\.+/, '').toLowerCase()
  return out === '' ? null : out
}

/** A space is unread when its newest message is newer than my read position and wasn't sent by me. */
export function isUnread(args: {
  latestAt: string | null
  latestAuthorId: string | null
  lastReadAt: string | null
  myId: string | null
}): boolean {
  const { latestAt, latestAuthorId, lastReadAt, myId } = args
  if (!latestAt) return false
  if (myId !== null && latestAuthorId === myId) return false
  if (!lastReadAt) return true
  return Date.parse(latestAt) > Date.parse(lastReadAt)
}
