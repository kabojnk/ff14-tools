import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { ThemePreset } from '@/types'

interface UiState {
  eepMode: boolean
  eepPassphrase: string | null
  sidebarOpen: boolean
  memberListOpen: boolean
  theme: ThemePreset

  setEepMode: (active: boolean) => void
  loadEepPassphrase: () => Promise<void>
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  toggleMemberList: () => void
  setTheme: (theme: ThemePreset) => void
}

export const useUiStore = create<UiState>((set) => ({
  eepMode: sessionStorage.getItem('eepMode') === 'true',
  eepPassphrase: null,
  sidebarOpen: true,
  memberListOpen: localStorage.getItem('memberListOpen') !== 'false',
  theme: (localStorage.getItem('theme') as ThemePreset) || 'dark',

  setEepMode: (active) => {
    sessionStorage.setItem('eepMode', String(active))
    set({ eepMode: active })
    document.title = active ? 'FF14 Random Content Picker' : 'Internal Tools Portal'
  },

  loadEepPassphrase: async () => {
    const { data } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'eep_passphrase')
      .single()
    if (data) set({ eepPassphrase: data.value })
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
