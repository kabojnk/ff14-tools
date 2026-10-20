import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { SPACES, spaceKey } from '@/lib/spaces'
import { useReactionStore } from '@/stores/reactionStore'
import type { Message, Space } from '@/types'

interface MessageState {
  messages: Record<string, Message[]> // keyed by spaceKey(conversationId, space)
  loading: boolean

  fetchMessages: (conversationId: string, space: Space) => Promise<void>
  /** Saves an edit; resolves to the saved row, or null if it failed. */
  editMessage: (messageId: string, newContent: string, key: string) => Promise<Message | null>
  deleteMessage: (messageId: string, key: string) => Promise<void>
  /**
   * Marks (or unmarks) one photo, video or GIF of any message as a spoiler: at once here, then through
   * set_attachment_spoiler (members may do it on either person's messages). Rolled back on failure.
   * Resolves to whether it worked. The other device hears it as a messages UPDATE (an `edit`).
   */
  setAttachmentSpoiler: (key: string, messageId: string, index: number, spoiler: boolean) => Promise<boolean>
  /** Loads the page before the oldest loaded message. Resolves to whether there may be more. */
  fetchOlder: (conversationId: string, space: Space) => Promise<boolean>
  /** Adds the message (or merges a realtime echo into my pending one with the same id). */
  addMessage: (key: string, message: Message) => void
  /** My message, shown at once while it's sent. Its id is client-generated and becomes the row's id. */
  addPending: (key: string, message: Message) => void
  /** The server row for a pending message: replaces it in place. */
  confirmPending: (key: string, id: string, message: Message) => void
  failPending: (key: string, id: string) => void
  /** Back to sending (Retry). */
  retryPending: (key: string, id: string) => void
  updateMessage: (key: string, message: Message) => void
  removeMessage: (key: string, messageId: string) => void
  clearMessages: (key: string) => void
  clearConversation: (conversationId: string) => void
}

const PAGE_SIZE = 50

/** The message at `i` replaced by `message`, without any local state. */
function replaceAt(list: Message[], i: number, message: Message): Message[] {
  const { localState: _drop, ...server } = message
  void _drop
  const next = list.slice()
  next[i] = server
  return next
}

export const useMessageStore = create<MessageState>((set, get) => {
  const setLocalState = (key: string, id: string, localState: 'sending' | 'failed') =>
    set((state) => {
      const existing = state.messages[key] ?? []
      const i = existing.findIndex((m) => m.id === id && m.localState)
      if (i === -1) return state
      const next = existing.slice()
      next[i] = { ...existing[i], localState }
      return { messages: { ...state.messages, [key]: next } }
    })

  const load = async (key: string, request: PromiseLike<{ data: unknown; error: unknown }>) => {
    set({ loading: true })
    const { data, error } = await request
    if (!error && data) {
      // The RPCs return newest first; reverse for display.
      const msgs = [...(data as Message[])].reverse()
      set((state) => {
        // My unconfirmed messages aren't on the server (yet): keep them at the end.
        const ids = new Set(msgs.map((m) => m.id))
        const local = (state.messages[key] ?? []).filter((m) => m.localState && !ids.has(m.id))
        return { messages: { ...state.messages, [key]: [...msgs, ...local] }, loading: false }
      })
      // The page's reactions, in one query (also re-run on a rejoin and after the lake, which reload here).
      void useReactionStore.getState().loadFor(msgs.map((m) => m.id))
    } else {
      set({ loading: false })
    }
  }

  return {
    messages: {},
    loading: false,

    fetchMessages: (conversationId, space) =>
      load(
        spaceKey(conversationId, space),
        supabase.rpc('get_messages', { p_conversation: conversationId, p_space: space, p_limit: PAGE_SIZE }),
      ),

    fetchOlder: async (conversationId, space) => {
      const key = spaceKey(conversationId, space)
      const oldest = (get().messages[key] ?? []).find((m) => !m.localState)
      const { data, error } = await supabase.rpc('get_messages', {
        p_conversation: conversationId,
        p_space: space,
        p_limit: PAGE_SIZE,
        ...(oldest ? { p_before: oldest.created_at } : {}),
      })
      if (error || !data) return false
      const page = [...(data as Message[])].reverse()
      if (page.length > 0) {
        set((state) => {
          const existing = state.messages[key] ?? []
          const ids = new Set(existing.map((m) => m.id))
          return { messages: { ...state.messages, [key]: [...page.filter((m) => !ids.has(m.id)), ...existing] } }
        })
        void useReactionStore.getState().loadFor(page.map((m) => m.id))
      }
      return page.length >= PAGE_SIZE
    },

    editMessage: async (messageId, newContent, key) => {
      const { data, error } = await supabase
        .from('messages')
        .update({ content: newContent, edited_at: new Date().toISOString() })
        .eq('id', messageId)
        .select()
        .single()

      if (error || !data) return null
      get().updateMessage(key, data as Message)
      return data as Message
    },

    deleteMessage: async (messageId, key) => {
      const { error } = await supabase.from('messages').update({ deleted: true }).eq('id', messageId)

      if (!error) {
        get().removeMessage(key, messageId)
      }
    },

    setAttachmentSpoiler: async (key, messageId, index, spoiler) => {
      const setFlag = (value: boolean) =>
        set((state) => {
          const existing = state.messages[key] ?? []
          const i = existing.findIndex((m) => m.id === messageId)
          if (i === -1 || !existing[i].attachments[index]) return state
          const next = existing.slice()
          next[i] = {
            ...existing[i],
            attachments: existing[i].attachments.map((a, j) => (j === index ? { ...a, spoiler: value } : a)),
          }
          return { messages: { ...state.messages, [key]: next } }
        })

      setFlag(spoiler)
      const { error } = await supabase.rpc('set_attachment_spoiler', {
        p_message: messageId,
        p_index: index,
        p_spoiler: spoiler,
      })
      if (error) {
        setFlag(!spoiler)
        return false
      }
      return true
    },

    addMessage: (key, message) => {
      set((state) => {
        const existing = state.messages[key] ?? []
        const i = existing.findIndex((m) => m.id === message.id)
        if (i === -1) return { messages: { ...state.messages, [key]: [...existing, message] } }
        // The echo of my own pending message: the server row replaces it. Otherwise a duplicate.
        if (!existing[i].localState) return state
        return { messages: { ...state.messages, [key]: replaceAt(existing, i, message) } }
      })
    },

    addPending: (key, message) => {
      set((state) => {
        const existing = state.messages[key] ?? []
        if (existing.some((m) => m.id === message.id)) return state
        return { messages: { ...state.messages, [key]: [...existing, { ...message, localState: 'sending' }] } }
      })
    },

    confirmPending: (key, id, message) => {
      set((state) => {
        const existing = state.messages[key] ?? []
        const i = existing.findIndex((m) => m.id === id)
        if (i === -1) return state
        return { messages: { ...state.messages, [key]: replaceAt(existing, i, message) } }
      })
    },

    failPending: (key, id) => setLocalState(key, id, 'failed'),
    retryPending: (key, id) => setLocalState(key, id, 'sending'),

    updateMessage: (key, message) => {
      set((state) => {
        const existing = state.messages[key] ?? []
        return { messages: { ...state.messages, [key]: existing.map((m) => (m.id === message.id ? message : m)) } }
      })
    },

    removeMessage: (key, messageId) => {
      set((state) => {
        const existing = state.messages[key] ?? []
        return { messages: { ...state.messages, [key]: existing.filter((m) => m.id !== messageId) } }
      })
    },

    clearMessages: (key) => {
      set((state) => ({ messages: { ...state.messages, [key]: [] } }))
    },

    clearConversation: (conversationId) => {
      set((state) => {
        const messages = { ...state.messages }
        for (const space of SPACES) messages[spaceKey(conversationId, space)] = []
        return { messages }
      })
    },
  }
})
