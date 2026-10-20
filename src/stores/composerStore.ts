import { create } from 'zustand'
import type { Message } from '@/types'

interface ComposerState {
  /** My message being edited, or null. */
  editing: Message | null
  /** Starts editing a message (replacing any edit in progress). */
  startEdit: (message: Message) => void
  /** Stops editing without saving. */
  cancelEdit: () => void
}

/**
 * What the composer is doing besides writing a new message. The Edit action (⋮ menu, long-press sheet,
 * the E key) starts an edit here; the Composer shows the message under an "Editing message" bar.
 */
export const useComposerStore = create<ComposerState>((set) => ({
  editing: null,
  startEdit: (message) => set({ editing: message }),
  cancelEdit: () => set({ editing: null }),
}))
