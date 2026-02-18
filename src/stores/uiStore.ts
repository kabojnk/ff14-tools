import { create } from 'zustand'
import type { ThemePreset } from '@/types'

interface UiState {
  eepMode: boolean
  sidebarOpen: boolean
  theme: ThemePreset

  setEepMode: (active: boolean) => void
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  setTheme: (theme: ThemePreset) => void
}

export const useUiStore = create<UiState>((set) => ({
  eepMode: sessionStorage.getItem('eepMode') === 'true',
  sidebarOpen: true,
  theme: (localStorage.getItem('theme') as ThemePreset) || 'dark',

  setEepMode: (active) => {
    sessionStorage.setItem('eepMode', String(active))
    set({ eepMode: active })
    // Change browser title based on mode
    document.title = active ? 'FF14 Random Content Picker' : 'Internal Tools Portal'
  },

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  setTheme: (theme) => {
    localStorage.setItem('theme', theme)
    set({ theme })
  },
}))
