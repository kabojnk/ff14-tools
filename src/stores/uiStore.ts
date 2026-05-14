import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { ThemePreset } from '@/types'

interface UiState {
  eepMode: boolean
  eepPassphrase: string | null
  pinCode: string | null
  pinLocked: boolean
  sidebarOpen: boolean
  memberListOpen: boolean
  theme: ThemePreset

  setEepMode: (active: boolean) => void
  lockApp: () => void
  unlockPin: () => void
  loadEepPassphrase: () => Promise<void>
  loadPin: (userId: string) => Promise<void>
  setPinCode: (userId: string, pin: string | null) => Promise<void>
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  toggleMemberList: () => void
  setTheme: (theme: ThemePreset) => void
}

export const useUiStore = create<UiState>((set) => ({
  eepMode: sessionStorage.getItem('eepMode') === 'true',
  eepPassphrase: null,
  pinCode: null,
  pinLocked: false,
  sidebarOpen: true,
  memberListOpen: localStorage.getItem('memberListOpen') !== 'false',
  theme: (localStorage.getItem('theme') as ThemePreset) || 'dark',

  setEepMode: (active) => {
    sessionStorage.setItem('eepMode', String(active))
    set({ eepMode: active })
    document.title = active ? 'FF14 Random Content Picker' : 'XIV Tools'
  },

  lockApp: () => {
    sessionStorage.setItem('eepMode', 'true')
    set({ eepMode: true, pinLocked: true })
    document.title = 'FF14 Random Content Picker'
  },

  unlockPin: () => set({ pinLocked: false }),

  loadEepPassphrase: async () => {
    const { data } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'eep_passphrase')
      .single()
    if (data) set({ eepPassphrase: data.value })
  },

  loadPin: async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('lock_pin')
      .eq('id', userId)
      .single()
    if (data) set({ pinCode: data.lock_pin ?? null })
  },

  setPinCode: async (userId: string, pin: string | null) => {
    await supabase
      .from('profiles')
      .update({ lock_pin: pin })
      .eq('id', userId)
    set({ pinCode: pin })
  },

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  toggleMemberList: () => set((s) => {
    const next = !s.memberListOpen
    localStorage.setItem('memberListOpen', String(next))
    return { memberListOpen: next }
  }),

  setTheme: (theme) => {
    localStorage.setItem('theme', theme)
    set({ theme })
  },
}))
