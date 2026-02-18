import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { Message } from '@/types'

interface MessageState {
  messages: Record<string, Message[]> // keyed by channel_id
  loading: boolean

  fetchMessages: (channelId: string) => Promise<void>
  sendMessage: (channelId: string, sessionId: string, content: string, authorId: string) => Promise<void>
  editMessage: (messageId: string, newContent: string, channelId: string) => Promise<void>
  deleteMessage: (messageId: string, channelId: string) => Promise<void>
  addMessage: (channelId: string, message: Message) => void
  updateMessage: (channelId: string, message: Message) => void
  removeMessage: (channelId: string, messageId: string) => void
  clearMessages: (channelId: string) => void
}

export const useMessageStore = create<MessageState>((set, get) => ({
  messages: {},
  loading: false,

  fetchMessages: async (channelId) => {
    set({ loading: true })

    const { data, error } = await supabase.rpc('get_channel_messages', {
      p_channel_id: channelId,
      p_limit: 50,
    })

    if (!error && data) {
      // RPC returns messages in desc order, reverse for display
      const msgs = (data as Message[]).reverse()
      set((state) => ({
        messages: { ...state.messages, [channelId]: msgs },
        loading: false,
      }))
    } else {
      set({ loading: false })
    }
  },

  sendMessage: async (channelId, sessionId, content, authorId) => {
    const { data, error } = await supabase
      .from('messages')
      .insert({
        channel_id: channelId,
        session_id: sessionId,
        author_id: authorId,
        content,
        type: 'text',
      })
      .select()
      .single()

    if (!error && data) {
      // Broadcast will handle adding to the store
      // But add optimistically for the sender
      get().addMessage(channelId, data as Message)
    }
  },

  editMessage: async (messageId, newContent, channelId) => {
    const { data, error } = await supabase
      .from('messages')
      .update({ content: newContent, edited_at: new Date().toISOString() })
      .eq('id', messageId)
      .select()
      .single()

    if (!error && data) {
      get().updateMessage(channelId, data as Message)
    }
  },

  deleteMessage: async (messageId, channelId) => {
    const { error } = await supabase
      .from('messages')
      .update({ deleted: true })
      .eq('id', messageId)

    if (!error) {
      get().removeMessage(channelId, messageId)
    }
  },

  addMessage: (channelId, message) => {
    set((state) => {
      const existing = state.messages[channelId] ?? []
      // Avoid duplicates
      if (existing.some((m) => m.id === message.id)) return state
      return {
        messages: {
          ...state.messages,
          [channelId]: [...existing, message],
        },
      }
    })
  },

  updateMessage: (channelId, message) => {
    set((state) => {
      const existing = state.messages[channelId] ?? []
      return {
        messages: {
          ...state.messages,
          [channelId]: existing.map((m) => (m.id === message.id ? message : m)),
        },
      }
    })
  },

  removeMessage: (channelId, messageId) => {
    set((state) => {
      const existing = state.messages[channelId] ?? []
      return {
        messages: {
          ...state.messages,
          [channelId]: existing.filter((m) => m.id !== messageId),
        },
      }
    })
  },

  clearMessages: (channelId) => {
    set((state) => ({
      messages: { ...state.messages, [channelId]: [] },
    }))
  },
}))
