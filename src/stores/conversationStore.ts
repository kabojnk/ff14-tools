import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { SPACES } from '@/lib/spaces'
import { useMessageStore } from '@/stores/messageStore'
import type { Attachment, Conversation, Message, ReadPosition, Session, Space } from '@/types'

import type { RealtimeStatus } from '@/lib/conversationRealtime'

export interface OutgoingMessage {
  authorId: string
  space: Space
  content: string | null
  attachments: Attachment[]
  type: Message['type']
}

type Latest = { at: string; authorId: string } | null

interface ConversationState {
  conversation: Conversation | null
  memberIds: string[]
  activeSpace: Space
  activeSession: Session | null
  readAt: Record<Space, string | null> // my read positions
  latest: Record<Space, Latest>
  loading: boolean
  /** Status of the conversation's realtime channel (rendered as data-realtime). */
  realtimeStatus: RealtimeStatus

  /** First non-archived conversation visible to me (RLS), its members, newest visible session, my read positions, latest per space. */
  load: (myId: string) => Promise<void>
  setActiveSpace: (space: Space) => void
  /** Newest visible session, else insert one for the conversation. */
  getOrCreateSession: () => Promise<Session | null>
  /**
   * Inserts a message into the newest visible session. If the session was hidden in the meantime
   * (a drag on another screen: RLS answers 42501), refetches the session once and retries.
   */
  sendMessage: (m: OutgoingMessage) => Promise<Message | null>
  setRealtimeStatus: (s: RealtimeStatus) => void
  /** Optimistically clears both spaces, then hides every session on the server. */
  dragTheLake: () => Promise<void>
  fillTheLake: (password: string) => Promise<'filled' | 'wrong' | 'error'>
  /** Refetch the session, both spaces' messages and latest after a drag or fill (here or on another screen). */
  reloadAfterLake: () => Promise<void>
  /** Recompute latest for both spaces from the server (after deleting the newest message, or on a realtime join). */
  refreshLatest: () => Promise<void>
  noteMessage: (m: Message) => void
  applyReadPosition: (rp: ReadPosition, myId: string) => void
  markReadLocal: (space: Space, at: string) => void
  reset: () => void
}

const SPACE_STORAGE_KEY = 'activeSpace'

function storedSpace(): Space {
  try {
    const v = sessionStorage.getItem(SPACE_STORAGE_KEY)
    return v === 'main' || v === 'schist' ? v : 'main'
  } catch {
    return 'main'
  }
}

function storeSpace(space: Space | null) {
  try {
    if (space) sessionStorage.setItem(SPACE_STORAGE_KEY, space)
    else sessionStorage.removeItem(SPACE_STORAGE_KEY)
  } catch {
    // Storage blocked (private mode): the space just isn't remembered.
  }
}

const isNewer = (a: string, than: string | null | undefined) => !than || Date.parse(a) > Date.parse(than)

/** Lake broadcasts go through the realtime module (Task 12), injected here to keep the store free of channel code. */
let broadcastLake: () => void = () => {}
export function setLakeBroadcaster(fn: () => void) {
  broadcastLake = fn
}

const emptyBySpace = <T>(v: T): Record<Space, T> => ({ main: v, schist: v })

const initial = () => ({
  conversation: null,
  memberIds: [] as string[],
  activeSession: null,
  readAt: emptyBySpace<string | null>(null),
  latest: emptyBySpace<Latest>(null),
  loading: false,
  realtimeStatus: 'CLOSED' as RealtimeStatus,
})

async function fetchNewestSession(conversationId: string): Promise<Session | null> {
  const { data } = await supabase
    .from('sessions')
    .select('*')
    .eq('conversation_id', conversationId)
    .eq('visible', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as Session | null) ?? null
}

async function fetchLatest(conversationId: string, space: Space): Promise<Latest | undefined> {
  const { data, error } = await supabase.rpc('get_messages', { p_conversation: conversationId, p_space: space, p_limit: 1 })
  if (error) return undefined // keep what we had
  const m = (data as Message[] | null)?.[0]
  return m ? { at: m.created_at, authorId: m.author_id } : null
}

export const useConversationStore = create<ConversationState>((set, get) => ({
  ...initial(),
  activeSpace: storedSpace(),

  load: async (myId) => {
    set({ loading: true })
    const { data: conv } = await supabase
      .from('conversations')
      .select('*')
      .eq('archived', false)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    const conversation = (conv as Conversation | null) ?? null
    if (!conversation) {
      set({ ...initial() })
      return
    }

    const [members, session, positions, latest] = await Promise.all([
      supabase.from('conversation_members').select('user_id').eq('conversation_id', conversation.id),
      fetchNewestSession(conversation.id),
      supabase.from('read_positions').select('*').eq('conversation_id', conversation.id).eq('user_id', myId),
      Promise.all(SPACES.map((s) => fetchLatest(conversation.id, s))),
    ])

    const readAt = emptyBySpace<string | null>(null)
    for (const rp of (positions.data as ReadPosition[] | null) ?? []) readAt[rp.space] = rp.last_read_at

    set({
      conversation,
      memberIds: ((members.data as { user_id: string }[] | null) ?? []).map((m) => m.user_id),
      activeSession: session,
      readAt,
      latest: { main: latest[0] ?? null, schist: latest[1] ?? null },
      loading: false,
    })
  },

  setActiveSpace: (space) => {
    storeSpace(space)
    set({ activeSpace: space })
  },

  getOrCreateSession: async () => {
    const { conversation, activeSession } = get()
    if (!conversation) return null
    if (activeSession && activeSession.conversation_id === conversation.id) return activeSession

    const found = await fetchNewestSession(conversation.id)
    if (found) {
      set({ activeSession: found })
      return found
    }

    const { data: created, error } = await supabase
      .from('sessions')
      .insert({ conversation_id: conversation.id, visible: true })
      .select()
      .single()
    if (error || !created) return null
    set({ activeSession: created as Session })
    return created as Session
  },

  sendMessage: async (m) => {
    const insert = async () => {
      const { conversation } = get()
      const session = await get().getOrCreateSession()
      if (!conversation || !session) return { data: null, error: null }
      return supabase
        .from('messages')
        .insert({
          conversation_id: conversation.id,
          space: m.space,
          session_id: session.id,
          author_id: m.authorId,
          content: m.content,
          attachments: m.attachments,
          type: m.type,
        })
        .select()
        .single()
    }

    let { data, error } = await insert()
    if ((error as { code?: string } | null)?.code === '42501') {
      set({ activeSession: null })
      ;({ data, error } = await insert())
    }
    return !error && data ? (data as Message) : null
  },

  setRealtimeStatus: (realtimeStatus) => set({ realtimeStatus }),

  dragTheLake: async () => {
    const { conversation } = get()
    if (!conversation) return
    // Hide everything immediately; don't wait for the server.
    useMessageStore.getState().clearConversation(conversation.id)
    set({ activeSession: null, latest: emptyBySpace<Latest>(null) })

    const { data, error } = await supabase.rpc('drag_the_lake', { p_conversation: conversation.id })
    if (error || typeof data !== 'string') {
      // The server didn't drag: show what is really there again.
      await get().reloadAfterLake()
      return
    }
    set({
      activeSession: {
        id: data,
        conversation_id: conversation.id,
        channel_id: null,
        visible: true,
        created_by: '',
        created_at: new Date().toISOString(),
      },
    })
    broadcastLake()
  },

  fillTheLake: async (password) => {
    const { conversation } = get()
    if (!conversation) return 'error'
    const { data, error } = await supabase.rpc('fill_the_lake', { p_conversation: conversation.id, p_password: password })
    if (error) return 'error'
    if (data !== true) return 'wrong'
    await get().reloadAfterLake()
    broadcastLake()
    return 'filled'
  },

  reloadAfterLake: async () => {
    const { conversation } = get()
    if (!conversation) return
    const { fetchMessages } = useMessageStore.getState()
    const [session] = await Promise.all([
      fetchNewestSession(conversation.id),
      ...SPACES.map((s) => fetchMessages(conversation.id, s)),
      get().refreshLatest(),
    ])
    set({ activeSession: session })
  },

  refreshLatest: async () => {
    const { conversation } = get()
    if (!conversation) return
    const fetched = await Promise.all(SPACES.map((s) => fetchLatest(conversation.id, s)))
    if (get().conversation?.id !== conversation.id) return
    set((state) => ({
      latest: {
        main: fetched[0] === undefined ? state.latest.main : fetched[0],
        schist: fetched[1] === undefined ? state.latest.schist : fetched[1],
      },
    }))
  },

  noteMessage: (m) => {
    const { conversation, latest } = get()
    if (!conversation || m.conversation_id !== conversation.id || m.deleted) return
    if (!isNewer(m.created_at, latest[m.space]?.at)) return
    set({ latest: { ...latest, [m.space]: { at: m.created_at, authorId: m.author_id } } })
  },

  applyReadPosition: (rp, myId) => {
    const { conversation, readAt } = get()
    if (rp.user_id !== myId || !conversation || rp.conversation_id !== conversation.id) return
    if (!isNewer(rp.last_read_at, readAt[rp.space])) return
    set({ readAt: { ...readAt, [rp.space]: rp.last_read_at } })
  },

  markReadLocal: (space, at) => {
    const { readAt } = get()
    if (!isNewer(at, readAt[space])) return
    set({ readAt: { ...readAt, [space]: at } })
  },

  reset: () => {
    storeSpace(null)
    set({ ...initial(), activeSpace: 'main' })
  },
}))
