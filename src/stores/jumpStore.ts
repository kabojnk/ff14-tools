import { create } from 'zustand'
import type { Space } from '@/types'

/** A request nobody took within this long (the list never opened) is dropped instead of jumping later. */
export const JUMP_MAX_AGE_MS = 10_000

export interface JumpTarget {
  messageId: string
  space: Space
  /** The message's time: the list pages back until it has loaded this far. */
  created_at: string
}

export interface JumpRequest extends JumpTarget {
  /** Date.now() when requested. Each request is a new object, so asking twice for one message jumps twice. */
  at: number
}

interface JumpState {
  pending: JumpRequest | null
  /** "Show in chat" from the viewer, a pin or a search result. AppShell switches space; MessageList jumps. */
  request: (target: JumpTarget) => void
  /** MessageList takes the request for its own space: returned once, then cleared. Stale requests are dropped. */
  take: (space: Space) => { messageId: string; created_at: string } | null
  reset: () => void
}

/** A pending jump to a message, from outside the message list. */
export const useJumpStore = create<JumpState>((set, get) => ({
  pending: null,

  request: (target) => set({ pending: { ...target, at: Date.now() } }),

  take: (space) => {
    const { pending } = get()
    if (!pending) return null
    if (Date.now() - pending.at > JUMP_MAX_AGE_MS) {
      set({ pending: null })
      return null
    }
    if (pending.space !== space) return null
    set({ pending: null })
    return { messageId: pending.messageId, created_at: pending.created_at }
  },

  reset: () => set({ pending: null }),
}))
