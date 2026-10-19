import { create } from 'zustand'
import type { Space } from '@/types'

/** How long a typing indicator lasts after the last typing event. */
export const TYPING_TIMEOUT_MS = 5000

export interface TypingEntry {
  user_id: string
  nickname: string
  at: number
}

interface TypingState {
  typing: Record<Space, TypingEntry[]>
  noteTyping: (space: Space, user: { user_id: string; nickname: string }, at?: number) => void
  /** They sent their message (or cleared the box): hide the indicator until they type again. */
  stopTyping: (space: Space, userId: string) => void
  prune: (now: number) => void
  clear: () => void
}

const empty = (): Record<Space, TypingEntry[]> => ({ main: [], schist: [] })

export const useTypingStore = create<TypingState>((set) => ({
  typing: empty(),

  noteTyping: (space, user, at = Date.now()) =>
    set((state) => ({
      typing: {
        ...state.typing,
        [space]: [...state.typing[space].filter((t) => t.user_id !== user.user_id), { user_id: user.user_id, nickname: user.nickname, at }],
      },
    })),

  stopTyping: (space, userId) =>
    set((state) =>
      state.typing[space].some((t) => t.user_id === userId)
        ? { typing: { ...state.typing, [space]: state.typing[space].filter((t) => t.user_id !== userId) } }
        : state,
    ),

  prune: (now) =>
    set((state) => {
      let changed = false
      const next = empty()
      for (const space of Object.keys(state.typing) as Space[]) {
        next[space] = state.typing[space].filter((t) => now - t.at < TYPING_TIMEOUT_MS)
        if (next[space].length !== state.typing[space].length) changed = true
      }
      return changed ? { typing: next } : state
    }),

  clear: () => set({ typing: empty() }),
}))
