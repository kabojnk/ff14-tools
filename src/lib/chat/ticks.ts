export type Tick = 'sending' | 'sent' | 'read' | 'failed'

export type LocalState = 'sending' | 'failed'

/**
 * Tick for one of my messages. A local state (sending / failed) wins; else it
 * is read when the partner's read position is at or after the message time.
 * `partnerReadAt` is null when either person has read receipts off (RLS hides
 * the row), so the tick stays at sent.
 */
export function tickState(
  m: { created_at: string; localState?: LocalState },
  partnerReadAt: string | null,
): Tick {
  if (m.localState) return m.localState
  if (partnerReadAt === null) return 'sent'
  const readAt = Date.parse(partnerReadAt)
  const createdAt = Date.parse(m.created_at)
  if (Number.isNaN(readAt) || Number.isNaN(createdAt)) return 'sent'
  return readAt >= createdAt ? 'read' : 'sent'
}
