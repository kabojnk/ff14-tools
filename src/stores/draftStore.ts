import { create } from 'zustand'
import type { Attachment } from '@/types'

/** A file in the composer's tray: uploading, ready to send, or failed (Retry / Remove). */
export interface PendingAttachment {
  /** Local id (stable across re-renders and remounts). */
  id: string
  filename: string
  type: Attachment['type']
  /** Thumbnail source: an object URL while uploading, the uploaded URL after. */
  preview: string | null
  spoiler: boolean
  status: 'uploading' | 'done' | 'failed'
  /** Kept for Retry. */
  file: File | null
  /** The uploaded attachment, once done. */
  uploaded: Attachment | null
}

export interface Draft {
  content: string
  attachments: PendingAttachment[]
}

interface DraftState {
  /** Unsent drafts by spaceKey. */
  drafts: Record<string, Draft>
  setContent: (key: string, content: string) => void
  addAttachment: (key: string, item: PendingAttachment) => void
  patchAttachment: (key: string, id: string, patch: Partial<PendingAttachment>) => void
  removeAttachment: (key: string, id: string) => void
  /** Empties the tray (after a send); the text is kept as it is. */
  clearAttachments: (key: string) => void
}

const EMPTY: Draft = { content: '', attachments: [] }

/**
 * Unsent drafts by space. They outlive the composer, which remounts when the layout crosses the desktop
 * breakpoint (e.g. rotating an iPhone) or the space changes, and an upload that finishes after a remount
 * still lands in its tray. A drag of the lake leaves them alone.
 */
export const useDraftStore = create<DraftState>((set) => {
  const update = (key: string, fn: (d: Draft) => Draft) =>
    set((s) => {
      const next = fn(s.drafts[key] ?? EMPTY)
      const drafts = { ...s.drafts }
      if (!next.content && next.attachments.length === 0) delete drafts[key]
      else drafts[key] = next
      return { drafts }
    })
  return {
    drafts: {},
    setContent: (key, content) => update(key, (d) => (d.content === content ? d : { ...d, content })),
    addAttachment: (key, item) => update(key, (d) => ({ ...d, attachments: [...d.attachments, item] })),
    patchAttachment: (key, id, patch) =>
      update(key, (d) => ({ ...d, attachments: d.attachments.map((a) => (a.id === id ? { ...a, ...patch } : a)) })),
    removeAttachment: (key, id) => update(key, (d) => ({ ...d, attachments: d.attachments.filter((a) => a.id !== id) })),
    clearAttachments: (key) => update(key, (d) => ({ ...d, attachments: [] })),
  }
})

/** The attachment as it is sent, with the spoiler flag chosen in the tray. */
export function toAttachment(p: PendingAttachment): Attachment | null {
  return p.status === 'done' && p.uploaded ? { ...p.uploaded, spoiler: p.spoiler } : null
}
