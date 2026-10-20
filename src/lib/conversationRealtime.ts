import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Message, Reaction, ReadPosition, Space } from '@/types'

export type RealtimeStatus = 'CLOSED' | 'JOINING' | 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT'
export type MessageEventKind = 'new' | 'edit' | 'delete'
/** A delete only needs to say which message went, and where. */
export type MessageRef = { id: string; space: Space; created_at?: string }

export interface ConversationHandlers {
  onMessage(m: Message | MessageRef, kind: MessageEventKind): void
  onTyping(space: Space, user: { user_id: string; nickname: string }): void
  onTypingStop(space: Space, userId: string): void
  onLake(): void
  onReadPosition(rp: ReadPosition): void
  /** A member's profiles row changed. The full row, `lock_pin` included: the receiver must drop it. */
  onProfile(row: Record<string, unknown>): void
  /** A reaction row came or went. A DELETE carries only the primary key, and reaches every subscriber. */
  onReaction(event: 'INSERT' | 'DELETE', row: Partial<Reaction> & { id: string }): void
  /** SUBSCRIBED only once broadcasts AND postgres_changes are live (see joinConversation). */
  onStatus(s: RealtimeStatus, rejoined: boolean): void
}

/** The slice of the supabase client this module uses, so tests can pass a fake. */
export interface RealtimeClientLike {
  channel(topic: string, opts?: { config: Record<string, unknown> }): RealtimeChannel
  getChannels(): RealtimeChannel[]
  removeChannel(channel: RealtimeChannel): Promise<unknown>
  /** Drops a channel from the client's registry now, even if its leave hasn't been acknowledged yet. */
  forgetChannel(channel: RealtimeChannel): void
}

const LAKE_DEBOUNCE_MS = 250
/**
 * How long a joined channel waits for Realtime to confirm its postgres_changes before calling itself
 * subscribed anyway (broadcasts work from the join; only the database safety nets would still be late).
 */
export const POSTGRES_READY_TIMEOUT_MS = 10_000

/**
 * Owns the one private `conv:<id>` channel per device. Message, typing and lake broadcasts for both
 * spaces travel on it, plus postgres_changes on messages, sessions and read positions as a safety net
 * (which also covers inserts from a cached old app), on the members' profiles, and on reactions (one
 * binding for every message, instead of a channel per message).
 *
 * StrictMode-safe: the channel is created synchronously, a generation counter silences callbacks from
 * a channel that has been left, and a second join for the same conversation reuses the first.
 */
export function createConversationRealtime(client: RealtimeClientLike) {
  let generation = 0
  let current: { id: string; generation: number; channel: RealtimeChannel; leave: () => void } | null = null
  let lakeTimer: ReturnType<typeof setTimeout> | null = null

  const drop = (ch: RealtimeChannel) => {
    void client.removeChannel(ch)
    if (client.getChannels().includes(ch)) client.forgetChannel(ch)
  }

  function joinConversation(
    conversationId: string,
    handlers: ConversationHandlers,
    { memberIds = [] }: { memberIds?: string[] } = {},
  ): () => void {
    if (current && current.id === conversationId) return current.leave
    current?.leave()

    // A channel that is still leaving would be handed back by client.channel() for the same topic.
    const topic = `conv:${conversationId}`
    for (const ch of client.getChannels()) {
      if (ch.topic === `realtime:${topic}`) drop(ch)
    }

    const gen = ++generation
    const live = () => gen === generation
    let joinedBefore = false
    // A join is live only when both have happened: the join reply (SUBSCRIBED, broadcasts flow) and
    // Realtime's "Subscribed to PostgreSQL" system message (postgres_changes flow). The second comes
    // later: a few ms on a warm server, seconds on a cold one (after a restart, Realtime first starts its
    // replication for the tenant), and changes committed in between are never delivered.
    let joined = false
    let postgresReady = false
    let reported = false
    let readyTimer: ReturnType<typeof setTimeout> | null = null
    const clearReadyTimer = () => {
      if (readyTimer) clearTimeout(readyTimer)
      readyTimer = null
    }
    const reportIfReady = () => {
      if (!live() || !joined || !postgresReady || reported) return
      reported = true
      clearReadyTimer()
      const rejoined = joinedBefore
      joinedBefore = true
      handlers.onStatus('SUBSCRIBED', rejoined)
    }

    const lake = () => {
      if (lakeTimer) clearTimeout(lakeTimer)
      lakeTimer = setTimeout(() => {
        lakeTimer = null
        if (live()) handlers.onLake()
      }, LAKE_DEBOUNCE_MS)
    }

    const filter = `conversation_id=eq.${conversationId}`
    const channel = client
      .channel(topic, { config: { private: true, broadcast: { self: false } } })
      .on('broadcast', { event: 'message' }, ({ payload }) => {
        if (!live()) return
        const { kind, message } = payload as { kind: MessageEventKind; message: Message | MessageRef }
        if (kind === 'new' || kind === 'edit' || kind === 'delete') handlers.onMessage(message, kind)
      })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (!live()) return
        const { space, user_id, nickname } = payload as { space: Space; user_id: string; nickname: string }
        handlers.onTyping(space, { user_id, nickname })
      })
      .on('broadcast', { event: 'typing_stop' }, ({ payload }) => {
        if (!live()) return
        const { space, user_id } = payload as { space: Space; user_id: string }
        handlers.onTypingStop(space, user_id)
      })
      .on('broadcast', { event: 'lake' }, () => {
        if (live()) lake()
      })
      .on('system', {}, (payload: { extension?: string; status?: string; message?: string }) => {
        if (!live() || payload?.extension !== 'postgres_changes') return
        if (payload.status !== 'ok') console.warn('Realtime database changes unavailable:', payload.message)
        postgresReady = true
        reportIfReady()
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter }, (payload) => {
        if (!live()) return
        const m = payload.new as Message
        if (!m.deleted) handlers.onMessage(m, 'new')
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter }, (payload) => {
        if (!live()) return
        const m = payload.new as Message
        handlers.onMessage(m, m.deleted ? 'delete' : 'edit')
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions', filter }, () => {
        if (live()) lake()
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'read_positions', filter }, (payload) => {
        if (live()) handlers.onReadPosition(payload.new as ReadPosition)
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'read_positions', filter }, (payload) => {
        if (live()) handlers.onReadPosition(payload.new as ReadPosition)
      })
      // Unfiltered: reactions have no conversation_id, and RLS already limits delivery to members.
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reactions' }, (payload) => {
        if (live()) handlers.onReaction('INSERT', payload.new as Reaction)
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'reactions' }, (payload) => {
        const old = payload.old as Partial<Reaction>
        if (live() && old?.id) handlers.onReaction('DELETE', { ...old, id: old.id })
      })
    // The members' profiles (name, avatar, status, presence override, last seen), live for the header.
    if (memberIds.length > 0) {
      channel.on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=in.(${memberIds.join(',')})` },
        (payload) => {
          if (live()) handlers.onProfile(payload.new as Record<string, unknown>)
        },
      )
    }

    const leave = () => {
      if (!current || current.generation !== gen) return
      generation++
      current = null
      if (lakeTimer) clearTimeout(lakeTimer)
      lakeTimer = null
      clearReadyTimer()
      drop(channel)
    }
    current = { id: conversationId, generation: gen, channel, leave }

    handlers.onStatus('JOINING', false)
    channel.subscribe((status) => {
      if (!live()) return
      if (status === 'SUBSCRIBED') {
        joined = true
        if (!postgresReady && !readyTimer) {
          clearReadyTimer()
          readyTimer = setTimeout(() => {
            readyTimer = null
            postgresReady = true
            reportIfReady()
          }, POSTGRES_READY_TIMEOUT_MS)
        }
        reportIfReady()
      } else {
        // The next join gets its own confirmation.
        joined = false
        postgresReady = false
        reported = false
        clearReadyTimer()
        handlers.onStatus(status as RealtimeStatus, false)
      }
    })

    return leave
  }

  const send = (event: string, payload: Record<string, unknown>) => {
    void current?.channel.send({ type: 'broadcast', event, payload })
  }

  return {
    joinConversation,
    /** Leaves whatever conversation is joined (sign-out). */
    leaveConversation: () => current?.leave(),
    sendMessageEvent: (kind: MessageEventKind, m: Message | MessageRef) => send('message', { kind, message: m }),
    sendTyping: (space: Space, user: { user_id: string; nickname: string }) => send('typing', { space, ...user }),
    sendTypingStop: (space: Space, userId: string) => send('typing_stop', { space, user_id: userId }),
    sendLake: () => send('lake', {}),
  }
}

const realtime = createConversationRealtime({
  channel: (topic, opts) => supabase.channel(topic, opts),
  getChannels: () => supabase.getChannels(),
  removeChannel: (ch) => supabase.removeChannel(ch),
  forgetChannel: (ch) => {
    supabase.realtime.channels = supabase.realtime.channels.filter((c) => c !== ch)
  },
})

export const { joinConversation, leaveConversation, sendMessageEvent, sendTyping, sendTypingStop, sendLake } = realtime
