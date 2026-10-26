import { uploadFile } from '@/lib/bunny'
import { forgetUpload, newId, sendOutgoing } from '@/lib/chat/outbox'
import { spaceKey } from '@/lib/spaces'
import type { VoiceRecording } from '@/lib/voice/recorder'
import { useMessageStore } from '@/stores/messageStore'
import type { Attachment, Space } from '@/types'

/** My memos from the moment they're in the list until they're sent: the disguise throws these away. */
const unsent = new Map<string, { key: string; local: string }>()

interface SendVoice {
  authorId: string
  conversationId: string
  space: Space
  recording: VoiceRecording
  replyTo: string | null
}

/**
 * Sends a memo: it shows at once (playable from the local copy) while it uploads to voice/<conversation>,
 * then the row is inserted. A failed upload or insert leaves it in the list with Retry.
 */
export async function sendVoiceMemo({ authorId, conversationId, space, recording, replyTo }: SendVoice): Promise<void> {
  const key = spaceKey(conversationId, space)
  const filename = `voice-${newId()}.${recording.format.ext}`
  const file = new File([recording.blob], filename, { type: recording.blob.type })
  const local = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(recording.blob) : ''
  const base = { type: 'audio' as const, filename, spoiler: false, duration_ms: recording.durationMs, peaks: recording.peaks }
  const attachment: Attachment = { url: local, size: file.size, ...base }

  const id = await sendOutgoing(
    { authorId, space, content: null, attachments: [attachment], type: 'text', replyTo },
    {
      prepare: async () => {
        const result = await uploadFile(file, `voice/${conversationId}`)
        return [{ url: result.url, size: result.size, ...base }]
      },
      onAdded: (added) => unsent.set(added, { key, local }),
    },
  )
  if (!id || !unsent.has(id)) return // never added, or already thrown away
  // A failed memo keeps its local copy for Retry (and stays discardable); a sent one doesn't need it.
  if (useMessageStore.getState().messages[key]?.find((m) => m.id === id)?.localState === 'failed') return
  unsent.delete(id)
  if (local) URL.revokeObjectURL(local)
}

/**
 * The disguise: my memos that are still uploading or failed leave the list, their uploads are abandoned
 * (an upload that finishes later sends nothing), and the recordings are freed. A memo whose upload has
 * finished and whose row is being inserted has, in effect, been sent: it may come back with the echo.
 */
export function discardUnsentVoice(): void {
  const store = useMessageStore.getState()
  for (const [id, { key, local }] of unsent) {
    const m = store.messages[key]?.find((x) => x.id === id)
    if (m?.localState) {
      forgetUpload(id)
      store.removeMessage(key, id)
    }
    if (local) URL.revokeObjectURL(local)
  }
  unsent.clear()
}
