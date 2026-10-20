import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { EmojiLookup } from '@/components/chat2/Markdown'

interface EmojiState {
  /** Custom emoji image URLs by name (without colons). */
  byName: Record<string, string>
  /** Stable for a given set of emoji; changes identity when the set changes (Markdown memoises on it). */
  lookup: EmojiLookup
  loaded: boolean
  /** Loads the custom emoji once per session; later calls are no-ops. */
  load: () => Promise<void>
  reset: () => void
}

const lookupFor = (byName: Record<string, string>): EmojiLookup => (name) => byName[name]

let inflight: Promise<void> | null = null

export const useEmojiStore = create<EmojiState>((set, get) => ({
  byName: {},
  lookup: lookupFor({}),
  loaded: false,

  load: () => {
    if (get().loaded) return Promise.resolve()
    inflight ??= (async () => {
      const { data, error } = await supabase.from('custom_emoji').select('name, image_url')
      inflight = null
      if (error || !data) return
      const byName: Record<string, string> = {}
      for (const e of data as { name: string; image_url: string }[]) byName[e.name] = e.image_url
      set({ byName, lookup: lookupFor(byName), loaded: true })
    })()
    return inflight
  },

  reset: () => set({ byName: {}, lookup: lookupFor({}), loaded: false }),
}))
