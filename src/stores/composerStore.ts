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
 * What the composer is doing besides writing a new message. Redesign 3a Task 10 wires the Edit action
 * here. Until Task 11 moves editing into the composer, the row's interim inline editor
 * (components/chat/legacy/LegacyInlineEdit) opens for `editing`.
 */
export const useComposerStore = create<ComposerState>((set) => ({
  editing: null,
  startEdit: (message) => set({ editing: message }),
  cancelEdit: () => set({ editing: null }),
}))
