import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'

interface PresenceUser {
  user_id: string
  status: 'online' | 'away' | 'offline'
  custom_status_text: string | null
  custom_status_emoji: string | null
}

interface PresenceState {
  onlineUsers: Record<string, PresenceUser>
  typingUsers: Record<string, string[]> // channelId -> user_ids
  presenceChannel: RealtimeChannel | null
  currentUserId: string | null
  // When the user explicitly picks a status, idle detection won't override it
  manualStatus: 'online' | 'away' | 'offline' | null

  initPresence: (userId: string, status: string, customText: string | null, customEmoji: string | null) => void
  updatePresence: (status: string, customText: string | null, customEmoji: string | null, manual?: boolean) => void
  cleanupPresence: () => void

  startTyping: (channelId: string, userId: string, nickname: string) => void
  subscribeTyping: (channelId: string, onTyping: (userId: string, nickname: string) => void) => RealtimeChannel
}

export const usePresenceStore = create<PresenceState>((set, get) => ({
  onlineUsers: {},
  typingUsers: {},
  presenceChannel: null,
  currentUserId: null,
  manualStatus: null,

  initPresence: (userId, status, customText, customEmoji) => {
    // If already initialized for this user, just update presence payload — don't re-subscribe
    const existing = get()
    if (existing.presenceChannel && existing.currentUserId === userId) {
      existing.updatePresence(status, customText, customEmoji)
      return
    }

    // Clean up any old channel first
    if (existing.presenceChannel) {
      supabase.removeChannel(existing.presenceChannel)
    }

    const channel = supabase.channel('presence', {
      config: { presence: { key: userId } },
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresenceUser>()
        const users: Record<string, PresenceUser> = {}
        for (const [, presences] of Object.entries(state)) {
          for (const presence of presences) {
            users[presence.user_id] = presence
          }
        }
        set({ onlineUsers: users })
      })
      .subscribe(async (status_response) => {
        if (status_response === 'SUBSCRIBED') {
          await channel.track({
            user_id: userId,
            status,
            custom_status_text: customText,
            custom_status_emoji: customEmoji,
          })
        }
      })

    set({ presenceChannel: channel, currentUserId: userId })
  },

  updatePresence: async (status, customText, customEmoji, manual = false) => {
    const { presenceChannel, currentUserId } = get()
    if (manual) {
      set({ manualStatus: status as 'online' | 'away' | 'offline' })
    }
    if (presenceChannel && currentUserId) {
      await presenceChannel.track({
        user_id: currentUserId,
        status,
        custom_status_text: customText,
        custom_status_emoji: customEmoji,
      })
    }
  },

  cleanupPresence: () => {
    const { presenceChannel } = get()
    if (presenceChannel) {
      supabase.removeChannel(presenceChannel)
    }
    set({ presenceChannel: null, currentUserId: null, onlineUsers: {}, manualStatus: null })
  },

  startTyping: (channelId, userId, nickname) => {
    const channel = supabase.channel(`typing:${channelId}`)
    channel.send({
      type: 'broadcast',
      event: 'typing_start',
      payload: { user_id: userId, nickname },
    })
  },

  subscribeTyping: (channelId, onTyping) => {
    const channel = supabase
      .channel(`typing:${channelId}`)
      .on('broadcast', { event: 'typing_start' }, ({ payload }) => {
        onTyping(payload.user_id, payload.nickname)
      })
      .subscribe()

    return channel
  },
}))
