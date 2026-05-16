import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { UserStatus } from '@/types'

interface PresenceUser {
  user_id: string
  status: UserStatus
  custom_status_text: string | null
  custom_status_emoji: string | null
}

interface PresenceState {
  onlineUsers: Record<string, PresenceUser>
  typingUsers: Record<string, string[]> // channelId -> user_ids
  presenceChannel: RealtimeChannel | null
  currentUserId: string | null
  // When the user explicitly picks a status, idle detection won't override it
  manualStatus: UserStatus | null

  initPresence: (userId: string, status: UserStatus, customText: string | null, customEmoji: string | null) => void
  updatePresence: (status: UserStatus, customText: string | null, customEmoji: string | null, manual?: boolean) => void
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
        const serverState = channel.presenceState<PresenceUser>()
        const users: Record<string, PresenceUser> = {}
        for (const [, presences] of Object.entries(serverState)) {
          for (const presence of presences) {
            users[presence.user_id] = presence
          }
        }
        // If the server hasn't confirmed our track yet, keep our optimistic self-entry
        // so we don't flash as offline while the round-trip is in flight.
        const { currentUserId, onlineUsers } = get()
        if (currentUserId && !users[currentUserId] && onlineUsers[currentUserId]) {
          users[currentUserId] = onlineUsers[currentUserId]
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

    // Set channel + currentUserId + optimistic self-entry in one update so the UI
    // is immediately consistent before the Realtime subscription round-trip completes.
    set((state) => ({
      presenceChannel: channel,
      currentUserId: userId,
      onlineUsers: {
        ...state.onlineUsers,
        [userId]: { user_id: userId, status, custom_status_text: customText, custom_status_emoji: customEmoji },
      },
    }))
  },

  updatePresence: async (status, customText, customEmoji, manual = false) => {
    const { presenceChannel, currentUserId } = get()
    if (manual) {
      set({ manualStatus: status })
    }
    // Optimistically update our own entry so the UI is immediately consistent,
    // without waiting for the server's sync event (which can race on reconnect).
    if (currentUserId) {
      set((state) => ({
        onlineUsers: {
          ...state.onlineUsers,
          [currentUserId]: {
            user_id: currentUserId,
            status,
            custom_status_text: customText,
            custom_status_emoji: customEmoji,
          },
        },
      }))
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
