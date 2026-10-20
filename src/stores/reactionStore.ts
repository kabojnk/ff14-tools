import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { Reaction } from '@/types'

export interface ReactionChip {
  emoji: string
  count: number
  mine: boolean
  userIds: string[]
}

interface ReactionState {
  byMessage: Record<string, Reaction[]>
  /** id → message_id: realtime DELETE events carry only the primary key. */
  idToMessage: Record<string, string>
  /** One `.in('message_id', ids)` query per loaded page. Replaces what it had for those messages. Never throws. */
  loadFor: (messageIds: string[]) => Promise<void>
  /** A realtime row. Unknown DELETE ids are no-ops: the events reach every subscriber. */
  apply: (event: 'INSERT' | 'DELETE', row: Partial<Reaction> & { id: string }) => void
  /** Adds or removes my reaction at once; rolls back and resolves false on error. */
  toggle: (messageId: string, emoji: string, myId: string) => Promise<boolean>
  chips: (messageId: string, myId: string) => ReactionChip[]
  reset: () => void
}

const OPTIMISTIC = 'optimistic:'
const isOptimistic = (r: Reaction) => r.id.startsWith(OPTIMISTIC)
const sameKey = (a: Pick<Reaction, 'message_id' | 'user_id' | 'emoji'>, b: Pick<Reaction, 'message_id' | 'user_id' | 'emoji'>) =>
  a.message_id === b.message_id && a.user_id === b.user_id && a.emoji === b.emoji

const NONE: Reaction[] = []

/** Chips for one message's reactions: one per emoji, in order of first use. */
export function chipsOf(list: Reaction[] | undefined, myId: string): ReactionChip[] {
  const chips: ReactionChip[] = []
  const byEmoji = new Map<string, ReactionChip>()
  for (const r of list ?? NONE) {
    let chip = byEmoji.get(r.emoji)
    if (!chip) {
      chip = { emoji: r.emoji, count: 0, mine: false, userIds: [] }
      byEmoji.set(r.emoji, chip)
      chips.push(chip)
    }
    if (chip.userIds.includes(r.user_id)) continue
    chip.count++
    chip.userIds.push(r.user_id)
    if (r.user_id === myId) chip.mine = true
  }
  return chips
}

/*
 * Realtime events that land while a loadFor query is in flight must survive its (older) snapshot.
 * Each event is stamped with a clock tick; a load keeps rows inserted after it started and drops rows
 * deleted after it started. The logs are cleared whenever no load is in flight.
 */
/** Rows that came from a page load (history): their chips don't pop in. */
const loadedRows = new WeakSet<Reaction>()
export const isFromLoad = (r: Reaction) => loadedRows.has(r)

let clock = 0
let inFlight = 0
const insertedAt = new Map<string, number>()
const deletedAt = new Map<string, number>()

export const useReactionStore = create<ReactionState>((set, get) => {
  /** Puts `rows` in place of `messageId`'s list, keeping the id index in step. */
  const replaceList = (messageId: string, rows: Reaction[]) =>
    set((state) => {
      const idToMessage = { ...state.idToMessage }
      for (const r of state.byMessage[messageId] ?? NONE) if (idToMessage[r.id] === messageId) delete idToMessage[r.id]
      for (const r of rows) if (!isOptimistic(r)) idToMessage[r.id] = messageId
      return { byMessage: { ...state.byMessage, [messageId]: rows }, idToMessage }
    })

  const listOf = (messageId: string) => get().byMessage[messageId] ?? NONE

  const loadFor = async (messageIds: string[]) => {
    if (messageIds.length === 0) return
    const start = ++clock
    inFlight++
    try {
      const { data, error } = await supabase
        .from('reactions')
        .select('*')
        .in('message_id', messageIds)
        .order('created_at', { ascending: true })
      if (error || !data) return
      const fetched = new Map<string, Reaction[]>(messageIds.map((id) => [id, []]))
      for (const r of data as Reaction[]) {
        if ((deletedAt.get(r.id) ?? 0) > start) continue
        loadedRows.add(r)
        fetched.get(r.message_id)?.push(r)
      }
      for (const [messageId, rows] of fetched) {
        // Mine still being sent, and anything realtime added after the snapshot was taken.
        const extra = listOf(messageId).filter(
          (r) =>
            (isOptimistic(r) || (insertedAt.get(r.id) ?? 0) > start) &&
            !rows.some((f) => f.id === r.id || sameKey(f, r)),
        )
        replaceList(messageId, [...rows, ...extra])
      }
    } catch {
      // Offline or the like: the reactions stay as they were; the next load or rejoin fetches them.
    } finally {
      if (--inFlight === 0) {
        insertedAt.clear()
        deletedAt.clear()
      }
    }
  }

  /** Swaps my optimistic row for the server row (or drops it when realtime already brought that row). */
  const settle = (messageId: string, optimisticId: string, server: Reaction | null) => {
    const list = listOf(messageId)
    if (!list.some((r) => r.id === optimisticId)) {
      if (server && !list.some((r) => r.id === server.id) && !list.some((r) => sameKey(r, server))) {
        replaceList(messageId, [...list, server])
      }
      return
    }
    const next =
      server && !list.some((r) => r.id === server.id)
        ? list.map((r) => (r.id === optimisticId ? server : r))
        : list.filter((r) => r.id !== optimisticId)
    replaceList(messageId, next)
  }

  return {
    byMessage: {},
    idToMessage: {},
    loadFor,

    apply: (event, row) => {
      const tick = ++clock
      if (event === 'DELETE') {
        if (inFlight > 0) deletedAt.set(row.id, tick)
        const messageId = get().idToMessage[row.id]
        if (!messageId) return
        replaceList(
          messageId,
          listOf(messageId).filter((r) => r.id !== row.id),
        )
        return
      }
      if (!row.message_id || !row.user_id || !row.emoji) return
      const full = row as Reaction
      if (get().idToMessage[full.id]) return
      if (inFlight > 0) insertedAt.set(full.id, tick)
      const list = listOf(full.message_id)
      const pending = list.findIndex((r) => isOptimistic(r) && sameKey(r, full))
      if (pending !== -1) {
        replaceList(full.message_id, list.map((r, i) => (i === pending ? full : r)))
      } else if (!list.some((r) => sameKey(r, full))) {
        replaceList(full.message_id, [...list, full])
      }
    },

    toggle: async (messageId, emoji, myId) => {
      const list = listOf(messageId)
      const index = list.findIndex((r) => r.user_id === myId && r.emoji === emoji)

      if (index !== -1) {
        const removed = list.filter((r) => r.user_id === myId && r.emoji === emoji)
        replaceList(
          messageId,
          list.filter((r) => !removed.includes(r)),
        )
        const { error } = await supabase
          .from('reactions')
          .delete()
          .eq('message_id', messageId)
          .eq('user_id', myId)
          .eq('emoji', emoji)
        if (!error) return true
        // Put it back where it was (unless something re-added it meanwhile).
        const now = listOf(messageId)
        if (!now.some((r) => r.user_id === myId && r.emoji === emoji)) {
          const restored = [...now]
          restored.splice(Math.min(index, restored.length), 0, ...removed)
          replaceList(messageId, restored)
        }
        return false
      }

      const optimistic: Reaction = {
        id: `${OPTIMISTIC}${crypto.randomUUID()}`,
        message_id: messageId,
        user_id: myId,
        emoji,
        created_at: new Date().toISOString(),
      }
      replaceList(messageId, [...list, optimistic])
      const { data, error } = await supabase
        .from('reactions')
        .insert({ message_id: messageId, user_id: myId, emoji })
        .select()
        .single()
      if (!error && data) {
        settle(messageId, optimistic.id, data as Reaction)
        return true
      }
      if (error?.code === '23505') {
        // Already there (another device of mine): fetch the real row.
        await loadFor([messageId])
        settle(messageId, optimistic.id, null)
        return true
      }
      settle(messageId, optimistic.id, null)
      return false
    },

    chips: (messageId, myId) => chipsOf(get().byMessage[messageId], myId),

    reset: () => set({ byMessage: {}, idToMessage: {} }),
  }
})
