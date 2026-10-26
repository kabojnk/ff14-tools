import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { Message, VoicePlay } from '@/types'

type PlayRow = Pick<VoicePlay, 'message_id' | 'user_id'>

interface VoicePlaysState {
  /** message id → who has started playing it. Mine always; theirs only while both have read receipts on (RLS). */
  byMessage: Record<string, string[]>
  /** One `.in('message_id', ids)` query per loaded page. Adds to what it has. Never throws. */
  loadFor: (messageIds: string[]) => Promise<void>
  /** A realtime voice_plays insert. */
  apply: (row: PlayRow) => void
  /** I started playing someone else's memo: shown at once; undone if the server refuses, so the next play retries. */
  markPlayed: (messageId: string, myId: string) => Promise<void>
  reset: () => void
}

const NONE: string[] = []
const inFlight = new Set<string>()

/** The voice memos among `messages`: only they can have plays. */
export function voiceMessageIds(messages: Message[]): string[] {
  return messages.filter((m) => m.attachments?.some((a) => a.type === 'audio')).map((m) => m.id)
}

export const useVoicePlayStore = create<VoicePlaysState>((set, get) => {
  const add = (messageId: string, userId: string) =>
    set((s) => {
      const list = s.byMessage[messageId] ?? NONE
      return list.includes(userId) ? s : { byMessage: { ...s.byMessage, [messageId]: [...list, userId] } }
    })
  const remove = (messageId: string, userId: string) =>
    set((s) => ({ byMessage: { ...s.byMessage, [messageId]: (s.byMessage[messageId] ?? NONE).filter((u) => u !== userId) } }))

  return {
    byMessage: {},

    loadFor: async (messageIds) => {
      if (messageIds.length === 0) return
      try {
        const { data, error } = await supabase.from('voice_plays').select('message_id, user_id').in('message_id', messageIds)
        if (error || !data) return
        for (const row of data as PlayRow[]) add(row.message_id, row.user_id)
      } catch {
        // Offline: the next page load or rejoin fetches them.
      }
    },

    apply: (row) => add(row.message_id, row.user_id),

    markPlayed: async (messageId, myId) => {
      if ((get().byMessage[messageId] ?? NONE).includes(myId) || inFlight.has(messageId)) return
      inFlight.add(messageId)
      add(messageId, myId)
      try {
        const { error } = await supabase.rpc('mark_voice_played', { p_message: messageId })
        if (error) remove(messageId, myId)
      } catch {
        remove(messageId, myId)
      } finally {
        inFlight.delete(messageId)
      }
    },

    reset: () => {
      inFlight.clear()
      set({ byMessage: {} })
    },
  }
})
