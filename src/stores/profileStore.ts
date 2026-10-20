import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/types'

/** Every profile column the app shows. Never `*`: the legacy `lock_pin` column must not be read. */
export const PROFILE_COLUMNS =
  'id, nickname, avatar_url, banner_url, profile_message, status, custom_status_text, status_id, read_receipts, lock_pin_length, presence_override, last_seen_at, created_at, updated_at'

const ALLOWED = new Set(PROFILE_COLUMNS.split(',').map((c) => c.trim()))

/** Keeps only the known columns, so `lock_pin` (sent in full realtime rows) is never stored. */
function clean(row: Record<string, unknown>): Partial<Profile> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) if (ALLOWED.has(k)) out[k] = v
  return out as Partial<Profile>
}

interface ProfileState {
  /** The conversation members' profiles, by user ID. Live through the conversation channel. */
  profiles: Record<string, Profile>
  load: (ids: string[]) => Promise<void>
  /** A profiles row (or part of one) from realtime or a write. */
  apply: (row: Record<string, unknown>) => void
  reset: () => void
}

export const useProfileStore = create<ProfileState>((set) => ({
  profiles: {},

  load: async (ids) => {
    if (ids.length === 0) return
    const { data, error } = await supabase.from('profiles').select(PROFILE_COLUMNS).in('id', ids)
    if (error || !data) return
    set((state) => {
      const profiles = { ...state.profiles }
      for (const row of data as unknown as Record<string, unknown>[]) {
        const p = clean(row)
        if (p.id) profiles[p.id] = p as Profile
      }
      return { profiles }
    })
  },

  apply: (row) => {
    const p = clean(row)
    if (!p.id) return
    const id = p.id
    set((state) => ({ profiles: { ...state.profiles, [id]: { ...state.profiles[id], ...p } as Profile } }))
  },

  reset: () => set({ profiles: {} }),
}))
