import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { leaveConversation } from '@/lib/conversationRealtime'
import { useConversationStore } from '@/stores/conversationStore'
import { useMessageStore } from '@/stores/messageStore'
import { useTypingStore } from '@/stores/typingStore'
import type { Profile } from '@/types'
import type { User, Session } from '@supabase/supabase-js'

interface AuthState {
  user: User | null
  session: Session | null
  profile: Profile | null
  loading: boolean
  initialized: boolean

  initialize: () => Promise<void>
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (email: string, password: string, nickname: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  fetchProfile: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  profile: null,
  loading: false,
  initialized: false,

  initialize: async () => {
    const { data: { session } } = await supabase.auth.getSession()

    if (session) {
      set({ user: session.user, session })
      await get().fetchProfile()
    }

    set({ initialized: true })

    // Listen for auth changes
    supabase.auth.onAuthStateChange(async (_event, session) => {
      set({ user: session?.user ?? null, session })
      if (session?.user) {
        await get().fetchProfile()
      } else {
        set({ profile: null })
      }
    })
  },

  signIn: async (email, password) => {
    set({ loading: true })
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    set({ loading: false })
    return { error: error?.message ?? null }
  },

  signUp: async (email, password, nickname) => {
    set({ loading: true })
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) {
      set({ loading: false })
      return { error: error.message }
    }

    // Create profile after signup
    if (data.user) {
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: data.user.id,
          nickname,
        })
      if (profileError) {
        set({ loading: false })
        return { error: profileError.message }
      }
    }

    set({ loading: false })
    return { error: null }
  },

  signOut: async () => {
    // Leave the private conversation channel and forget its data before the token goes.
    leaveConversation()
    const conversationId = useConversationStore.getState().conversation?.id
    if (conversationId) useMessageStore.getState().clearConversation(conversationId)
    useConversationStore.getState().reset()
    useTypingStore.getState().clear()
    await supabase.auth.signOut()
    set({ user: null, session: null, profile: null })
  },

  fetchProfile: async () => {
    const { user } = get()
    if (!user) return

    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (data) {
      set({ profile: data as Profile })
    }
  },
}))
