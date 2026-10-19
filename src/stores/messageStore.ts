import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { SPACES, spaceKey } from '@/lib/spaces'
import type { Message, Space } from '@/types'

interface MessageState {
  messages: Record<string, Message[]> // keyed by spaceKey(conversationId, space)
  loading: boolean

  fetchMessages: (conversationId: string, space: Space) => Promise<void>
  /** @deprecated Legacy channel path; removed in Task 12 when the UI moves to spaces. */
  fetchChannelMessages: (channelId: string) => Promise<void>
  editMessage: (messageId: string, newContent: string, key: string) => Promise<void>
  deleteMessage: (messageId: string, key: string) => Promise<void>
  addMessage: (key: string, message: Message) => void
  updateMessage: (key: string, message: Message) => void
  removeMessage: (key: string, messageId: string) => void
  clearMessages: (key: string) => void
  clearConversation: (conversationId: string) => void
  clearAllMessages: () => void
}

export const useMessageStore = create<MessageState>((set, get) => {
  const load = async (key: string, request: PromiseLike<{ data: unknown; error: unknown }>) => {
    set({ loading: true })
    const { data, error } = await request
    if (!error && data) {
      // The RPCs return newest first; reverse for display.
      const msgs = [...(data as Message[])].reverse()
      set((state) => ({ messages: { ...state.messages, [key]: msgs }, loading: false }))
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
        supabase.rpc('get_messages', { p_conversation: conversationId, p_space: space, p_limit: 50 }),
      ),

    fetchChannelMessages: (channelId) =>
      load(channelId, supabase.rpc('get_channel_messages', { p_channel_id: channelId, p_limit: 50 })),

    editMessage: async (messageId, newContent, key) => {
      const { data, error } = await supabase
        .from('messages')
        .update({ content: newContent, edited_at: new Date().toISOString() })
        .eq('id', messageId)
        .select()
        .single()

      if (!error && data) {
        get().updateMessage(key, data as Message)
      }
    },

    deleteMessage: async (messageId, key) => {
      const { error } = await supabase.from('messages').update({ deleted: true }).eq('id', messageId)

      if (!error) {
        get().removeMessage(key, messageId)
      }
    },

    addMessage: (key, message) => {
      set((state) => {
        const existing = state.messages[key] ?? []
        // Avoid duplicates
        if (existing.some((m) => m.id === message.id)) return state
        return { messages: { ...state.messages, [key]: [...existing, message] } }
      })
    },

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

    clearAllMessages: () => set({ messages: {} }),
  }
})
