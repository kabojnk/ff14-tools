import type { Message } from '@/types'

export type DividerMessage = Pick<Message, 'author_id' | 'created_at'> & { type?: Message['type'] }

/**
 * Index of the first message (oldest first) that someone else wrote after
 * `myReadAt`, where the "New messages" divider goes; -1 if none. System
 * messages never count. A null read position means nothing has been read.
 */
export function firstUnreadIndex(
  messages: readonly DividerMessage[],
  myReadAt: string | null,
  myId: string,
): number {
  const readAt = myReadAt === null ? Number.NEGATIVE_INFINITY : Date.parse(myReadAt)
  if (Number.isNaN(readAt)) return -1
  return messages.findIndex(
    (m) => m.author_id !== myId && m.type !== 'system' && Date.parse(m.created_at) > readAt,
  )
}
