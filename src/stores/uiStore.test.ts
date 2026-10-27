import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockSingle, mockSelect, mockRpc } = vi.hoisted(() => ({
  mockSingle: vi.fn(),
  mockSelect: vi.fn(),
  mockRpc: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: (cols: string) => {
        mockSelect(cols)
        return { eq: () => ({ single: mockSingle }) }
      },
    }),
    rpc: mockRpc,
  },
}))

import { useUiStore, VERIFY_PIN_TIMEOUT_MS } from '@/stores/uiStore'
import { THEME_IDS } from '@/lib/themes'

const initialState = useUiStore.getState()

beforeEach(() => {
  useUiStore.setState(initialState, true)
  mockSingle.mockReset()
  mockSelect.mockReset()
  mockRpc.mockReset().mockResolvedValue({ data: null, error: null })
})

describe('uiStore eep mode', () => {
  it('entering eep mode persists to sessionStorage and disguises the title', () => {
    useUiStore.getState().setEepMode(true)
    expect(useUiStore.getState().eepMode).toBe(true)
    expect(sessionStorage.getItem('eepMode')).toBe('true')
    expect(document.title).toBe('FF14 Random Content Picker')
  })

  it('leaving eep mode restores the app title', () => {
    useUiStore.getState().setEepMode(true)
    useUiStore.getState().setEepMode(false)
    expect(useUiStore.getState().eepMode).toBe(false)
    expect(sessionStorage.getItem('eepMode')).toBe('false')
    expect(document.title).toBe('XIV Tools')
  })

  it('lockApp enters eep mode and sets pinLocked; unlockPin clears it', () => {
    useUiStore.getState().lockApp()
    expect(useUiStore.getState()).toMatchObject({ eepMode: true, pinLocked: true })
    useUiStore.getState().unlockPin()
    expect(useUiStore.getState().pinLocked).toBe(false)
  })
})

describe('uiStore PIN pad and leaving the app', () => {
  const phone = (coarse: boolean) => vi.stubGlobal('matchMedia', vi.fn((q: string) => ({ matches: q === '(pointer: coarse)' && coarse })))
  afterEach(() => vi.unstubAllGlobals())

  it('the pad starts closed, even on a locked launch', () => {
    expect(useUiStore.getState().pinPadOpen).toBe(false)
  })

  it('opens and closes only when asked; Cancel leaves the lock as it was', () => {
    useUiStore.setState({ eepMode: true, pinLocked: true, pinLength: 6 })
    useUiStore.getState().openPinPad()
    expect(useUiStore.getState().pinPadOpen).toBe(true)
    useUiStore.getState().closePinPad()
    expect(useUiStore.getState()).toMatchObject({ pinPadOpen: false, pinLocked: true, eepMode: true })
  })

  it('any change of the disguise closes the pad', () => {
    for (const change of [
      () => useUiStore.getState().setEepMode(true),
      () => useUiStore.getState().setEepMode(false),
      () => useUiStore.getState().lockApp(),
      () => useUiStore.getState().disguiseOnLeave(),
      () => useUiStore.getState().unlockPin(),
      () => useUiStore.getState().clearPin(),
    ]) {
      useUiStore.setState({ pinPadOpen: true })
      change()
      expect(useUiStore.getState().pinPadOpen).toBe(false)
    }
  })

  it('a phone with a PIN that leaves the app comes back disguised and locked', () => {
    phone(true)
    useUiStore.setState({ eepMode: false, pinLocked: false, pinLength: 6, pinPadOpen: false })
    useUiStore.getState().disguiseOnLeave()
    expect(useUiStore.getState()).toMatchObject({ eepMode: true, pinLocked: true, pinPadOpen: false })
    expect(sessionStorage.getItem('eepMode')).toBe('true')
    expect(document.title).toBe('FF14 Random Content Picker')
  })

  it('leaving with the pad open (locked or not) closes it, and a lock stays on', () => {
    phone(true)
    useUiStore.setState({ eepMode: true, pinLocked: true, pinLength: 4, pinPadOpen: true })
    useUiStore.getState().disguiseOnLeave()
    expect(useUiStore.getState()).toMatchObject({ eepMode: true, pinLocked: true, pinPadOpen: false })
  })

  it('a phone without a PIN (or before the server said so) is disguised but never locked', () => {
    phone(true)
    useUiStore.setState({ eepMode: false, pinLocked: false, pinLength: null })
    useUiStore.getState().disguiseOnLeave()
    expect(useUiStore.getState()).toMatchObject({ eepMode: true, pinLocked: false })
  })

  it('a desktop is disguised but keeps today’s behaviour: no lock', () => {
    phone(false)
    useUiStore.setState({ eepMode: false, pinLocked: false, pinLength: 6 })
    useUiStore.getState().disguiseOnLeave()
    expect(useUiStore.getState()).toMatchObject({ eepMode: true, pinLocked: false })
  })

  it('the Eep! button (setEepMode) never locks', () => {
    phone(true)
    useUiStore.setState({ eepMode: false, pinLocked: false, pinLength: 6 })
    useUiStore.getState().setEepMode(true)
    expect(useUiStore.getState()).toMatchObject({ eepMode: true, pinLocked: false })
  })
})

describe('uiStore PIN', () => {
  it('loadPin reads only lock_pin_length, never lock_pin', async () => {
    mockSingle.mockResolvedValue({ data: { lock_pin_length: 6 }, error: null })
    await useUiStore.getState().loadPin('user-1')
    expect(mockSelect).toHaveBeenCalledWith('lock_pin_length')
    for (const [cols] of mockSelect.mock.calls) expect(String(cols)).not.toMatch(/\block_pin\b/)
    expect(useUiStore.getState().pinLength).toBe(6)
    expect(useUiStore.getState()).not.toHaveProperty('pinCode')
  })

  it('loadPin with no PIN leaves pinLength null', async () => {
    mockSingle.mockResolvedValue({ data: { lock_pin_length: null }, error: null })
    await useUiStore.getState().loadPin('user-1')
    expect(useUiStore.getState().pinLength).toBeNull()
  })

  it('loadPin with no row clears any previous PIN length', async () => {
    useUiStore.setState({ pinLength: 4 })
    mockSingle.mockResolvedValue({ data: null, error: { message: 'not found' } })
    await useUiStore.getState().loadPin('user-2')
    expect(useUiStore.getState().pinLength).toBeNull()
  })

  it('loadPin with a PIN marks this device as having one', async () => {
    mockSingle.mockResolvedValue({ data: { lock_pin_length: 6 }, error: null })
    await useUiStore.getState().loadPin('user-1')
    expect(localStorage.getItem('hasPin')).toBe('1')
  })

  it('loadPin with no PIN forgets the device flag and disarms a launch lock', async () => {
    localStorage.setItem('hasPin', '1')
    useUiStore.setState({ eepMode: true, pinLocked: true })
    mockSingle.mockResolvedValue({ data: { lock_pin_length: null }, error: null })
    await useUiStore.getState().loadPin('user-1')
    expect(localStorage.getItem('hasPin')).toBeNull()
    // Still disguised: the passphrase brings the chat back.
    expect(useUiStore.getState()).toMatchObject({ eepMode: true, pinLocked: false, pinLength: null })
  })

  it('a failed loadPin leaves the device flag and the launch lock alone (fails closed)', async () => {
    localStorage.setItem('hasPin', '1')
    useUiStore.setState({ eepMode: true, pinLocked: true })
    mockSingle.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } })
    await useUiStore.getState().loadPin('user-1')
    expect(localStorage.getItem('hasPin')).toBe('1')
    expect(useUiStore.getState()).toMatchObject({ eepMode: true, pinLocked: true })
  })

  it('a rejected loadPin leaves the device flag and the launch lock alone', async () => {
    localStorage.setItem('hasPin', '1')
    useUiStore.setState({ pinLocked: true })
    mockSingle.mockRejectedValue(new TypeError('Failed to fetch'))
    await useUiStore.getState().loadPin('user-1')
    expect(localStorage.getItem('hasPin')).toBe('1')
    expect(useUiStore.getState().pinLocked).toBe(true)
  })

  it('setPin calls set_pin and stores the new length', async () => {
    await useUiStore.getState().setPin('12345')
    expect(mockRpc).toHaveBeenCalledWith('set_pin', { p_pin: '12345' })
    expect(useUiStore.getState().pinLength).toBe(5)
    expect(localStorage.getItem('hasPin')).toBe('1')
  })

  it('setPin rejects and keeps the old length when the RPC fails', async () => {
    useUiStore.setState({ pinLength: 4 })
    mockRpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } })
    await expect(useUiStore.getState().setPin('999999')).rejects.toThrow('permission denied')
    expect(useUiStore.getState().pinLength).toBe(4)
  })

  it('setPin leaves the device flag alone when the RPC fails', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } })
    await expect(useUiStore.getState().setPin('999999')).rejects.toThrow()
    expect(localStorage.getItem('hasPin')).toBeNull()
  })

  it('clearPinRemote calls clear_pin and forgets the length', async () => {
    localStorage.setItem('hasPin', '1')
    useUiStore.setState({ pinLength: 4 })
    await useUiStore.getState().clearPinRemote()
    expect(mockRpc).toHaveBeenCalledWith('clear_pin')
    expect(useUiStore.getState().pinLength).toBeNull()
    expect(localStorage.getItem('hasPin')).toBeNull()
  })

  it('clearPinRemote rejects and keeps the length when the RPC fails', async () => {
    localStorage.setItem('hasPin', '1')
    useUiStore.setState({ pinLength: 4 })
    mockRpc.mockResolvedValue({ data: null, error: { message: 'offline' } })
    await expect(useUiStore.getState().clearPinRemote()).rejects.toThrow('offline')
    expect(useUiStore.getState().pinLength).toBe(4)
    expect(localStorage.getItem('hasPin')).toBe('1')
  })

  it('verifyPin returns the RPC result', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null })
    await expect(useUiStore.getState().verifyPin('1234')).resolves.toBe(true)
    expect(mockRpc).toHaveBeenCalledWith('verify_pin', { p_pin: '1234' })
    mockRpc.mockResolvedValue({ data: false, error: null })
    await expect(useUiStore.getState().verifyPin('9999')).resolves.toBe(false)
  })

  it('verifyPin throws on an RPC error (fails closed)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } })
    await expect(useUiStore.getState().verifyPin('1234')).rejects.toThrow('Failed to fetch')
  })

  it('verifyPin throws when the RPC itself rejects', async () => {
    mockRpc.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(useUiStore.getState().verifyPin('1234')).rejects.toThrow()
  })

  it('verifyPin gives up on an answer that never comes, so the pad can be tried again', async () => {
    vi.useFakeTimers()
    try {
      mockRpc.mockReturnValue(new Promise(() => {}))
      const result = expect(useUiStore.getState().verifyPin('1234')).rejects.toThrow('timed out')
      await vi.advanceTimersByTimeAsync(VERIFY_PIN_TIMEOUT_MS)
      await result
    } finally {
      vi.useRealTimers()
    }
  })

  it('clearPin forgets the PIN length and any lock (used on logout)', () => {
    useUiStore.setState({ pinLength: 4, pinLocked: true })
    useUiStore.getState().clearPin()
    expect(useUiStore.getState()).toMatchObject({ pinLength: null, pinLocked: false })
  })
})

describe('uiStore theme', () => {
  // The initial theme is read when the module loads, so each case loads a fresh copy.
  async function freshStore(stored: string | null, prefersDark: boolean) {
    vi.resetModules()
    if (stored !== null) localStorage.setItem('theme', stored)
    vi.stubGlobal('matchMedia', vi.fn((q: string) => ({ matches: q === '(prefers-color-scheme: dark)' && prefersDark })))
    const mod = await import('@/stores/uiStore')
    return mod.useUiStore
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each([
    [true, 'dark'],
    [false, 'light'],
  ])('with nothing stored, follows the OS (prefers dark: %s → %s)', async (prefersDark, expected) => {
    const store = await freshStore(null, prefersDark)
    expect(store.getState().theme).toBe(expected)
  })

  it.each(['solarized', 'Dark', ''])('an unknown stored id (%j) falls back to the OS default', async (stored) => {
    const store = await freshStore(stored, false)
    expect(store.getState().theme).toBe('light')
  })

  it.each(THEME_IDS)('%s round-trips through localStorage', async (id) => {
    const first = await freshStore(null, true)
    first.getState().setTheme(id)
    expect(localStorage.getItem('theme')).toBe(id)
    const second = await freshStore(null, true)
    expect(second.getState().theme).toBe(id)
  })

  it('survives localStorage throwing (private mode)', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })
    const store = await freshStore(null, true)
    expect(store.getState().theme).toBe('dark')
    expect(() => store.getState().setTheme('nord')).not.toThrow()
    expect(store.getState().theme).toBe('nord')
  })

  it('falls back to dark without matchMedia', async () => {
    vi.resetModules()
    vi.stubGlobal('matchMedia', undefined)
    const { useUiStore: store } = await import('@/stores/uiStore')
    expect(store.getState().theme).toBe('dark')
  })
})

describe('uiStore launch state', () => {
  // Computed when the module loads (before React renders), so each case loads a fresh copy.
  async function launch({ coarse, hasPin, eepSession = false }: { coarse: boolean; hasPin: boolean; eepSession?: boolean }) {
    vi.resetModules()
    if (hasPin) localStorage.setItem('hasPin', '1')
    if (eepSession) sessionStorage.setItem('eepMode', 'true')
    vi.stubGlobal('matchMedia', vi.fn((q: string) => ({ matches: q === '(pointer: coarse)' && coarse })))
    const mod = await import('@/stores/uiStore')
    return mod.useUiStore.getState()
  }

  afterEach(() => {
    vi.unstubAllGlobals()
    document.title = ''
  })

  it('a phone with a PIN opens disguised and locked, with the PIN pad closed until the dot is tapped', async () => {
    expect(await launch({ coarse: true, hasPin: true })).toMatchObject({ eepMode: true, pinLocked: true, pinPadOpen: false })
    expect(document.title).toBe('FF14 Random Content Picker')
  })

  it('a phone without a PIN opens the chat', async () => {
    expect(await launch({ coarse: true, hasPin: false })).toMatchObject({ eepMode: false, pinLocked: false })
  })

  it('a desktop with a PIN keeps today’s behaviour (opens the chat)', async () => {
    expect(await launch({ coarse: false, hasPin: true })).toMatchObject({ eepMode: false, pinLocked: false })
  })

  it('a desktop without a PIN opens the chat', async () => {
    expect(await launch({ coarse: false, hasPin: false })).toMatchObject({ eepMode: false, pinLocked: false })
  })

  it('eep mode from this tab still applies, without locking', async () => {
    expect(await launch({ coarse: false, hasPin: true, eepSession: true })).toMatchObject({ eepMode: true, pinLocked: false })
  })

  it('only the exact flag counts', async () => {
    vi.resetModules()
    localStorage.setItem('hasPin', 'true')
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
    const { useUiStore: store } = await import('@/stores/uiStore')
    expect(store.getState().pinLocked).toBe(false)
  })

  it('survives storage throwing and a missing matchMedia', async () => {
    vi.resetModules()
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    vi.stubGlobal('matchMedia', undefined)
    const { useUiStore: store } = await import('@/stores/uiStore')
    expect(store.getState()).toMatchObject({ eepMode: false, pinLocked: false })
    vi.restoreAllMocks()
  })
})
