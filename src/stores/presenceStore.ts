import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { aggregate, deviceId, displayed, type AggregatePresence, type DevicePresence } from '@/lib/presence'
import type { Presence, PresenceOverride } from '@/types'

interface PresenceState {
  /** Most-online state per user across their devices (no manual override applied; use displayed()). */
  users: Record<string, AggregatePresence>
  /** The last entries received from the server, flattened. */
  entries: DevicePresence[]
  presenceChannel: RealtimeChannel | null
  currentUserId: string | null
  /** This device's own state: online while visible, offline while hidden. */
  devicePresence: Presence
  /** My manual override (profiles.presence_override), mirrored into the legacy `status` field. */
  override: PresenceOverride | null

  initPresence: (userId: string, override: PresenceOverride | null, devicePresence?: Presence) => void
  setDevicePresence: (presence: Presence) => Promise<void>
  setOverride: (override: PresenceOverride | null) => Promise<void>
  /** A user's aggregate presence across devices; offline when absent. */
  presenceOf: (userId: string) => Presence
  /** Stamps profiles.last_seen_at = now() for the signed-in user. */
  touchLastSeen: () => Promise<void>
  cleanupPresence: () => void
}

function selfPayload(userId: string, presence: Presence, override: PresenceOverride | null) {
  return {
    user_id: userId,
    device_id: deviceId(),
    presence,
    // Old cached apps read `status`; give them the state everyone should see.
    status: displayed({ presence }, override),
    at: Date.now(),
  }
}

/** Server entries with this device's entry replaced by its current local state. */
function withSelf(entries: DevicePresence[], userId: string, presence: Presence): DevicePresence[] {
  const me = deviceId()
  const others = entries.filter((e) => !(e.user_id === userId && e.device_id === me))
  return [...others, { user_id: userId, device_id: me, presence, at: Date.now() }]
}

export const usePresenceStore = create<PresenceState>((set, get) => {
  const track = async () => {
    const { presenceChannel, currentUserId, devicePresence, override } = get()
    if (!presenceChannel || !currentUserId) return
    await presenceChannel.track(selfPayload(currentUserId, devicePresence, override))
  }

  return {
    users: {},
    entries: [],
    presenceChannel: null,
    currentUserId: null,
    devicePresence: 'online',
    override: null,

    initPresence: (userId, override, devicePresence = 'online') => {
      const existing = get()
      if (existing.presenceChannel && existing.currentUserId === userId) {
        set({ override, devicePresence })
        void track()
        return
      }
      if (existing.presenceChannel) supabase.removeChannel(existing.presenceChannel)

      const channel = supabase.channel('presence', {
        config: { presence: { key: `${userId}:${deviceId()}` } },
      })

      channel
        .on('presence', { event: 'sync' }, () => {
          const entries = Object.values(channel.presenceState<DevicePresence>()).flat()
          const { currentUserId, devicePresence: own } = get()
          const me = deviceId()
          // Until the server confirms this device, keep our optimistic entry so we don't flash offline.
          const confirmed = entries.some((e) => e.user_id === currentUserId && e.device_id === me)
          const list = currentUserId && !confirmed ? withSelf(entries, currentUserId, own) : entries
          set({ entries, users: aggregate(list) })
        })
        .subscribe(async (status) => {
          // Re-track the *current* state on every (re)subscribe.
          if (status === 'SUBSCRIBED') await track()
        })

      set({
        presenceChannel: channel,
        currentUserId: userId,
        devicePresence,
        override,
        entries: [],
        users: aggregate(withSelf([], userId, devicePresence)),
      })
    },

    setDevicePresence: async (presence) => {
      const { currentUserId, entries } = get()
      set({ devicePresence: presence })
      if (currentUserId) set({ users: aggregate(withSelf(entries, currentUserId, presence)) })
      await track()
    },

    setOverride: async (override) => {
      set({ override })
      await track()
    },

    presenceOf: (userId) => get().users[userId]?.presence ?? 'offline',

    touchLastSeen: async () => {
      if (!get().currentUserId) return
      await supabase.rpc('touch_last_seen')
    },

    cleanupPresence: () => {
      const { presenceChannel } = get()
      if (presenceChannel) supabase.removeChannel(presenceChannel)
      set({
        presenceChannel: null,
        currentUserId: null,
        users: {},
        entries: [],
        devicePresence: 'online',
        override: null,
      })
    },
  }
})
