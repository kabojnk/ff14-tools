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

function removeStorage(storage: () => Storage, key: string): void {
  try {
    storage().removeItem(key)
  } catch {
    // Nothing stored to forget.
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

/** Per-device hint that this account has a PIN ('1'), kept in step with the server. Only a boolean. */
export const HAS_PIN_KEY = 'hasPin'

const DISGUISE_TITLE = 'FF14 Random Content Picker'

/**
 * Launch state, computed when the module loads, before React renders. A phone (coarse pointer) that
 * has had a PIN opens on the FF14 screen with the PIN lock armed on every launch and reload, so the
 * chat is never painted first. The desktop keeps today's behaviour.
 */
function launchState(): { eepMode: boolean; pinLocked: boolean } {
  const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
  const hasPin = readStorage(local, HAS_PIN_KEY) === '1'
  const armed = coarse && hasPin
  const eepMode = readStorage(session, 'eepMode') === 'true' || armed
  if (eepMode) document.title = DISGUISE_TITLE
  return { eepMode, pinLocked: armed }
}

interface UiState {
  eepMode: boolean
  eepPassphrase: string | null
  pinLength: number | null
  pinLocked: boolean
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
  setTheme: (theme: ThemePreset) => void
}

export const useUiStore = create<UiState>((set) => ({
  ...launchState(),
  eepPassphrase: null,
  pinLength: null,
  theme: initialTheme(),

  setEepMode: (active) => {
    writeStorage(session, 'eepMode', String(active))
    set({ eepMode: active })
    document.title = active ? DISGUISE_TITLE : 'XIV Tools'
  },

  lockApp: () => {
    writeStorage(session, 'eepMode', 'true')
    set({ eepMode: true, pinLocked: true })
    document.title = DISGUISE_TITLE
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
  // The device flag and the launch lock change only on a successful answer: a failed read fails closed.
  loadPin: async (userId: string) => {
    let result: { data: { lock_pin_length: number | null } | null; error: unknown }
    try {
      result = await supabase
        .from('profiles')
        .select('lock_pin_length')
        .eq('id', userId)
        .single()
    } catch (error) {
      result = { data: null, error }
    }
    const { data, error } = result
    if (error || !data) {
      set({ pinLength: null })
      return
    }
    const length = data.lock_pin_length ?? null
    if (length === null) {
      removeStorage(local, HAS_PIN_KEY)
      set({ pinLength: null, pinLocked: false })
    } else {
      writeStorage(local, HAS_PIN_KEY, '1')
      set({ pinLength: length })
    }
  },

  // Throws if the write fails, so callers never show "saved" for a PIN that wasn't stored.
  setPin: async (pin: string) => {
    const { error } = await supabase.rpc('set_pin', { p_pin: pin })
    if (error) throw new Error(error.message)
    writeStorage(local, HAS_PIN_KEY, '1')
    set({ pinLength: pin.length })
  },

  clearPinRemote: async () => {
    const { error } = await supabase.rpc('clear_pin')
    if (error) throw new Error(error.message)
    removeStorage(local, HAS_PIN_KEY)
    set({ pinLength: null })
  },

  // Throws on any RPC failure so the pad shows "Couldn't verify. Try again." and stays locked.
  verifyPin: async (pin: string) => {
    const { data, error } = await supabase.rpc('verify_pin', { p_pin: pin })
    if (error) throw new Error(error.message)
    return data === true
  },

  clearPin: () => set({ pinLength: null, pinLocked: false }),

  setTheme: (theme) => {
    writeStorage(local, 'theme', theme)
    set({ theme })
  },
}))

/** True while the FF14 disguise is up: the chat's overlays are hidden then, and their key handlers stand down. */
export const isDisguised = () => useUiStore.getState().eepMode
