import { getFileType, uploadFile } from '@/lib/bunny'
import { newId } from '@/lib/chat/outbox'
import { useDraftStore } from '@/stores/draftStore'

const objectUrl = (file: File) =>
  typeof URL.createObjectURL === 'function' && /^(image|video)\//.test(file.type) ? URL.createObjectURL(file) : null

const revoke = (url: string | null) => {
  if (url?.startsWith('blob:') && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url)
}

/** Puts a file in the space's tray at once (uploading) and uploads it. */
export function startUpload(key: string, conversationId: string, file: File): void {
  const id = newId()
  useDraftStore.getState().addAttachment(key, {
    id,
    filename: file.name,
    type: getFileType(file.type),
    preview: objectUrl(file),
    spoiler: false,
    status: 'uploading',
    file,
    uploaded: null,
  })
  void upload(key, conversationId, id, file)
}

/** Uploads a failed file again. */
export function retryUpload(key: string, conversationId: string, id: string): void {
  const item = useDraftStore.getState().drafts[key]?.attachments.find((a) => a.id === id)
  if (!item?.file || item.status !== 'failed') return
  useDraftStore.getState().patchAttachment(key, id, { status: 'uploading' })
  void upload(key, conversationId, id, item.file)
}

/** Takes a file out of the tray (and frees its thumbnail). */
export function discardUpload(key: string, id: string): void {
  const item = useDraftStore.getState().drafts[key]?.attachments.find((a) => a.id === id)
  if (item) revoke(item.preview)
  useDraftStore.getState().removeAttachment(key, id)
}

/** Empties the tray after a send. */
export function clearUploads(key: string): void {
  for (const a of useDraftStore.getState().drafts[key]?.attachments ?? []) revoke(a.preview)
  useDraftStore.getState().clearAttachments(key)
}

async function upload(key: string, conversationId: string, id: string, file: File) {
  const store = useDraftStore.getState()
  try {
    const result = await uploadFile(file, `messages/${conversationId}`)
    const type = getFileType(result.type)
    store.patchAttachment(key, id, {
      status: 'done',
      type,
      uploaded: { url: result.url, type, filename: result.filename, size: result.size, spoiler: false },
    })
  } catch {
    // The thumbnail shows it failed, with Retry and Remove.
    store.patchAttachment(key, id, { status: 'failed' })
  }
}
