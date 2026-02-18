import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { Channel, Session } from '@/types'

interface ChannelState {
  channels: Channel[]
  activeChannelId: string | null
  activeSession: Session | null
  loading: boolean

  fetchChannels: () => Promise<void>
  setActiveChannel: (channelId: string) => Promise<void>
  createChannel: (name: string, description?: string) => Promise<{ error: string | null }>
  archiveChannel: (channelId: string) => Promise<void>
  fetchActiveSession: (channelId: string) => Promise<void>
  changeSheets: (channelId: string) => Promise<void>
}

export const useChannelStore = create<ChannelState>((set, get) => ({
  channels: [],
  activeChannelId: null,
  activeSession: null,
  loading: false,

  fetchChannels: async () => {
    set({ loading: true })
    const { data } = await supabase
      .from('channels')
      .select('*')
      .eq('archived', false)
      .order('position', { ascending: true })

    if (data) {
      set({ channels: data as Channel[] })

      // Auto-select first channel if none active
      const { activeChannelId } = get()
      if (!activeChannelId && data.length > 0) {
        await get().setActiveChannel(data[0].id)
      }
    }
    set({ loading: false })
  },

  setActiveChannel: async (channelId) => {
    set({ activeChannelId: channelId })
    await get().fetchActiveSession(channelId)
  },

  createChannel: async (name, description) => {
    const cleanName = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    if (!cleanName) return { error: 'Invalid channel name' }

    // Get max position
    const { channels } = get()
    const maxPosition = channels.reduce((max, ch) => Math.max(max, ch.position), -1)

    const { error } = await supabase
      .from('channels')
      .insert({
        name: cleanName,
        description: description || null,
        position: maxPosition + 1,
      })

    if (error) return { error: error.message }

    await get().fetchChannels()
    return { error: null }
  },

  archiveChannel: async (channelId) => {
    await supabase
      .from('channels')
      .update({ archived: true })
      .eq('id', channelId)

    // If we archived the active channel, switch to another
    const { activeChannelId } = get()
    await get().fetchChannels()

    if (activeChannelId === channelId) {
      const { channels } = get()
      if (channels.length > 0) {
        await get().setActiveChannel(channels[0].id)
      } else {
        set({ activeChannelId: null, activeSession: null })
      }
    }
  },

  fetchActiveSession: async (channelId) => {
    const { data } = await supabase
      .from('sessions')
      .select('*')
      .eq('channel_id', channelId)
      .eq('visible', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    set({ activeSession: data as Session | null })
  },

  changeSheets: async (channelId) => {
    const { data, error } = await supabase.rpc('change_sheets', {
      p_channel_id: channelId,
    })

    if (!error && data) {
      // Refresh the active session
      await get().fetchActiveSession(channelId)
    }
  },
}))
