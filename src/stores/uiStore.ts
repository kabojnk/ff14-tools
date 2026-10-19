import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { ThemePreset } from '@/types'
import { defaultTheme, isThemeId } from '@/lib/themes'

// Storage can throw (Safari private mode, blocked site data); never let that break the app.
function readStorage(storage: () => Storage, key: string): string | null {
  try {
    return storage().getItem(key)
  } catch {
    return null
  }
}

function writeStorage(storage: () => Storage, key: string, value: string): void {
  try {
    storage().setItem(key, value)
  } catch {
    // Not persisted; the in-memory state still applies.
  }
}

const local = () => localStorage
const session = () => sessionStorage

function prefersDark(): boolean {
  return typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : true
}

/** The stored theme if it's a known id; otherwise the OS default. `index.html` mirrors this for the first paint. */
function initialTheme(): ThemePreset {
  const stored = readStorage(local, 'theme')
  return isThemeId(stored) ? stored : defaultTheme(prefersDark())
}

interface UiState {
  eepMode: boolean
  eepPassphrase: string | null
  pinLength: number | null
  pinLocked: boolean
  sidebarOpen: boolean
  memberListOpen: boolean
  theme: ThemePreset

  setEepMode: (active: boolean) => void
  lockApp: () => void
  unlockPin: () => void
  loadEepPassphrase: () => Promise<void>
  loadPin: (userId: string) => Promise<void>
  setPin: (pin: string) => Promise<void>
  clearPinRemote: () => Promise<void>
  verifyPin: (pin: string) => Promise<boolean>
  clearPin: () => void
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  toggleMemberList: () => void
  setTheme: (theme: ThemePreset) => void
}

export const useUiStore = create<UiState>((set) => ({
  eepMode: readStorage(session, 'eepMode') === 'true',
  eepPassphrase: null,
  pinLength: null,
  pinLocked: false,
  sidebarOpen: true,
  memberListOpen: readStorage(local, 'memberListOpen') !== 'false',
  theme: initialTheme(),

  setEepMode: (active) => {
    writeStorage(session, 'eepMode', String(active))
    set({ eepMode: active })
    document.title = active ? 'FF14 Random Content Picker' : 'XIV Tools'
  },

  lockApp: () => {
    writeStorage(session, 'eepMode', 'true')
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

  // Only the length is readable; the PIN itself is checked on the server by verify_pin.
  loadPin: async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('lock_pin_length')
      .eq('id', userId)
      .single()
    set({ pinLength: data?.lock_pin_length ?? null })
  },

  // Throws if the write fails, so callers never show "saved" for a PIN that wasn't stored.
  setPin: async (pin: string) => {
    const { error } = await supabase.rpc('set_pin', { p_pin: pin })
    if (error) throw new Error(error.message)
    set({ pinLength: pin.length })
  },

  clearPinRemote: async () => {
    const { error } = await supabase.rpc('clear_pin')
    if (error) throw new Error(error.message)
    set({ pinLength: null })
  },

  // Throws on any RPC failure so the pad shows "Couldn't verify. Try again." and stays locked.
  verifyPin: async (pin: string) => {
    const { data, error } = await supabase.rpc('verify_pin', { p_pin: pin })
    if (error) throw new Error(error.message)
    return data === true
  },

  clearPin: () => set({ pinLength: null, pinLocked: false }),

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  toggleMemberList: () => set((s) => {
    const next = !s.memberListOpen
    writeStorage(local, 'memberListOpen', String(next))
    return { memberListOpen: next }
  }),

  setTheme: (theme) => {
    writeStorage(local, 'theme', theme)
    set({ theme })
  },
}))
