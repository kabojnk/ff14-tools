import { sendMessageEvent } from '@/lib/conversationRealtime'
import { spaceKey } from '@/lib/spaces'
import { useConversationStore, type OutgoingMessage } from '@/stores/conversationStore'
import { useMessageStore } from '@/stores/messageStore'
import type { Attachment, Message } from '@/types'

/** A message whose attachments upload before the row is inserted (voice memos). */
export interface UploadStep {
  /** Uploads and returns the attachments to send in place of the local ones. */
  prepare: () => Promise<Attachment[]>
  /** The message is in the list (as "sending") under this id: before the upload starts. */
  onAdded?: (id: string) => void
}

/**
 * Upload steps by message id, kept for Retry until the row is inserted. The step is memoised once it
 * succeeds, so a retry after a failed insert doesn't upload again.
 */
const uploads = new Map<string, () => Promise<Attachment[]>>()

function memoise(fn: () => Promise<Attachment[]>): () => Promise<Attachment[]> {
  let done: Promise<Attachment[]> | null = null
  return () => {
    done ??= fn().catch((e: unknown) => {
      done = null
      throw e
    })
    return done
  }
}

/** Abandons a message's upload step: an upload still running is then sent nowhere. */
export function forgetUpload(id: string): void {
  uploads.delete(id)
}

/**
 * Sends one of my messages. It shows at once (clock tick) under a client-generated id, which becomes
 * the row's id, so the realtime echo merges into it and a retry can never post twice.
 */
export async function sendOutgoing(m: Omit<OutgoingMessage, 'id'>, upload?: UploadStep): Promise<string | undefined> {
  const conv = useConversationStore.getState()
  const conversationId = conv.conversation?.id
  if (!conversationId) return undefined
  const id = newId()
  const key = spaceKey(conversationId, m.space)
  const local: Message = {
    id,
    conversation_id: conversationId,
    space: m.space,
    channel_id: null,
    session_id: conv.activeSession?.id ?? '',
    author_id: m.authorId,
    content: m.content,
    attachments: m.attachments,
    type: m.type,
    edited_at: null,
    deleted: false,
    reply_to: m.replyTo ?? null,
    created_at: new Date().toISOString(),
  }
  useMessageStore.getState().addPending(key, local)
  if (upload) {
    uploads.set(id, memoise(upload.prepare))
    upload.onAdded?.(id)
  }
  await deliver(key, { ...m, id })
  return id
}

/** Retry for a failed message: the same id again (a 23505 means the first try had landed). */
export async function retryOutgoing(key: string, id: string): Promise<void> {
  const m = useMessageStore.getState().messages[key]?.find((x) => x.id === id)
  if (!m || m.localState !== 'failed') return
  useMessageStore.getState().retryPending(key, id)
  await deliver(key, {
    id,
    authorId: m.author_id,
    space: m.space,
    content: m.content,
    attachments: m.attachments,
    type: m.type,
    replyTo: m.reply_to,
  })
}

/** crypto.randomUUID(), with a getRandomValues fallback: randomUUID only exists in secure contexts (not a LAN dev server). */
export function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

async function deliver(key: string, m: OutgoingMessage & { id: string }) {
  const prepare = uploads.get(m.id)
  if (prepare) {
    let attachments: Attachment[]
    try {
      attachments = await prepare()
    } catch {
      // Forgotten meanwhile (the disguise): it's gone from the list already, so nothing to fail.
      if (uploads.get(m.id) === prepare) useMessageStore.getState().failPending(key, m.id)
      return
    }
    // Forgotten while uploading: send nothing.
    if (uploads.get(m.id) !== prepare) return
    m = { ...m, attachments }
  } else if (m.attachments.some((a) => a.url.startsWith('blob:'))) {
    // A local copy without its upload step can never be sent.
    useMessageStore.getState().failPending(key, m.id)
    return
  }
  const conv = useConversationStore.getState()
  let data: Message | null = null
  try {
    data = await conv.sendMessage(m)
  } catch {
    data = null
  }
  const store = useMessageStore.getState()
  if (!data) {
    store.failPending(key, m.id)
    return
  }
  store.confirmPending(key, m.id, data)
  uploads.delete(m.id)
  useConversationStore.getState().noteMessage(data)
  sendMessageEvent('new', data)
}
