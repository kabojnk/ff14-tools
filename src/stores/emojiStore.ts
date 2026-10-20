import { create } from 'zustand'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { uploadFile } from '@/lib/bunny'
import { emojiNameError } from '@/lib/emoji/names'
import type { EmojiLookup } from '@/components/chat2/Markdown'
import type { CustomEmoji } from '@/types'

type Result = { error: string | null }

interface EmojiState {
  /** Every custom emoji, newest first. */
  rows: CustomEmoji[]
  /** Custom emoji image URLs by name (without colons). */
  byName: Record<string, string>
  /** Stable for a given set of emoji; changes identity when the set changes (Markdown memoises on it). */
  lookup: EmojiLookup
  loaded: boolean
  /**
   * Loads the custom emoji once per session (later calls are no-ops; after an error the next call tries
   * again). The first call also joins the live feed (subscribe), so no mount point is needed for it.
   */
  load: () => Promise<void>
  /** Live inserts and deletes; returns the cleanup. Safe to call twice (one channel). */
  subscribe: () => () => void
  /** Checks the name, uploads the picture, inserts the row (the database fills in the adder). */
  add: (name: string, file: File) => Promise<Result>
  /** Deletes optimistically; puts the row back if the server refuses. */
  remove: (id: string) => Promise<Result>
  /** Sign-out: forgets everything and leaves the live feed. */
  reset: () => void
}

const COLUMNS = 'id, name, image_url, uploaded_by, created_at'
const ADD_FAILED = 'Couldn’t add the emoji. Try again.'
const DELETE_FAILED = 'Couldn’t delete the emoji. Try again.'
/** The database's name check (23514) failed: the client rules say why, or the general rule. */
const NAME_RULE = 'Use lowercase letters, numbers and _ only.'
/** How long a locally deleted id stays suppressed against a late realtime INSERT. */
const DELETED_TTL_MS = 60_000

const lookupFor = (byName: Record<string, string>): EmojiLookup => (name) => byName[name]

function newestFirst(rows: CustomEmoji[]): CustomEmoji[] {
  return [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))
}

function sameMap(a: Record<string, string>, b: Record<string, string>): boolean {
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every((k) => b[k] === a[k])
}

let channel: RealtimeChannel | null = null
/** The feed's first SUBSCRIBED is the initial join; later ones are reconnects and reload. */
let joinedOnce = false
let inflight: Promise<void> | null = null
/** Bumped by reset, so answers to requests made before a sign-out are dropped. */
let generation = 0
/** Ids deleted here recently: a late realtime INSERT (or a reload racing the delete) must not revive them. */
const recentlyDeleted = new Map<string, ReturnType<typeof setTimeout>>()

function markDeleted(id: string) {
  clearTimeout(recentlyDeleted.get(id))
  recentlyDeleted.set(
    id,
    setTimeout(() => recentlyDeleted.delete(id), DELETED_TTL_MS),
  )
}

function unmarkDeleted(id: string) {
  clearTimeout(recentlyDeleted.get(id))
  recentlyDeleted.delete(id)
}

export const useEmojiStore = create<EmojiState>((set, get) => {
  /** Replaces the rows; byName and lookup keep their identity unless the name → picture set changed. */
  function setRows(rows: CustomEmoji[], extra: Partial<EmojiState> = {}) {
    const sorted = newestFirst(rows)
    const byName: Record<string, string> = {}
    // Oldest first, so on a (transient) duplicate name the newest wins.
    for (let i = sorted.length - 1; i >= 0; i--) byName[sorted[i].name] = sorted[i].image_url
    const prev = get().byName
    if (sameMap(prev, byName)) set({ rows: sorted, ...extra })
    else set({ rows: sorted, byName, lookup: lookupFor(byName), ...extra })
  }

  function fetchAll(): Promise<void> {
    inflight ??= (async () => {
      const gen = generation
      const { data, error } = await supabase.from('custom_emoji').select(COLUMNS)
      if (gen !== generation) return
      inflight = null
      if (error || !data) return
      setRows((data as CustomEmoji[]).filter((r) => !recentlyDeleted.has(r.id)), { loaded: true })
    })()
    return inflight
  }

  return {
    rows: [],
    byName: {},
    lookup: lookupFor({}),
    loaded: false,

    load: () => {
      if (!channel) get().subscribe()
      if (get().loaded) return Promise.resolve()
      return fetchAll()
    },

    subscribe: () => {
      if (!channel) {
        joinedOnce = false
        channel = supabase
          .channel(`custom-emoji:${generation}`)
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'custom_emoji' },
            (payload: { new: unknown }) => {
              const row = payload.new as CustomEmoji
              if (!row?.id || recentlyDeleted.has(row.id)) return
              if (get().rows.some((r) => r.id === row.id)) return
              setRows([...get().rows, row])
            },
          )
          .on(
            'postgres_changes',
            { event: 'DELETE', schema: 'public', table: 'custom_emoji' },
            (payload: { old: unknown }) => {
              // A DELETE carries only the primary key.
              const id = (payload.old as { id?: string })?.id
              if (!id || !get().rows.some((r) => r.id === id)) return
              setRows(get().rows.filter((r) => r.id !== id))
            },
          )
          .subscribe((status: string) => {
            if (status !== 'SUBSCRIBED') return
            // A rejoin after a drop: catch up on what changed while disconnected.
            if (joinedOnce) void fetchAll()
            joinedOnce = true
          })
      }
      return () => {
        if (channel) supabase.removeChannel(channel)
        channel = null
      }
    },

    add: async (name, file) => {
      const invalid = emojiNameError(name, new Set(Object.keys(get().byName)))
      if (invalid) return { error: invalid }
      const gen = generation
      let url: string
      try {
        url = (await uploadFile(file, 'emoji')).url
      } catch {
        return { error: ADD_FAILED }
      }
      // uploaded_by defaults to auth.uid(), which the insert policy requires.
      const { data, error } = await supabase
        .from('custom_emoji')
        .insert({ name, image_url: url })
        .select(COLUMNS)
        .single()
      if (error || !data) {
        const code = (error as { code?: string } | null)?.code
        if (code === '23505') return { error: `:${name}: is already taken.` }
        if (code === '23514') return { error: emojiNameError(name, new Set()) ?? NAME_RULE }
        return { error: ADD_FAILED }
      }
      const added = data as CustomEmoji
      if (gen === generation && !get().rows.some((r) => r.id === added.id)) setRows([...get().rows, added])
      return { error: null }
    },

    remove: async (id) => {
      const row = get().rows.find((r) => r.id === id)
      const gen = generation
      markDeleted(id)
      if (row) setRows(get().rows.filter((r) => r.id !== id))
      const { error } = await supabase.from('custom_emoji').delete().eq('id', id)
      if (error) {
        unmarkDeleted(id)
        if (row && gen === generation && !get().rows.some((r) => r.id === id)) setRows([...get().rows, row])
        return { error: DELETE_FAILED }
      }
      return { error: null }
    },

    reset: () => {
      generation++
      inflight = null
      if (channel) supabase.removeChannel(channel)
      channel = null
      joinedOnce = false
      for (const t of recentlyDeleted.values()) clearTimeout(t)
      recentlyDeleted.clear()
      set({ rows: [], byName: {}, lookup: lookupFor({}), loaded: false })
    },
  }
})
