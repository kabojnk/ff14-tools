import { render, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@supabase/supabase-js'

vi.mock('@/lib/platform', () => ({ isNativeApp: () => false }))
vi.mock('@/lib/supabase', () => ({ supabase: { realtime: { isConnected: () => true, connect: vi.fn() } } }))

import { usePresence } from '@/hooks/usePresence'
import { expectExternalUi, clearExternalUi } from '@/lib/externalUi'
import { useAuthStore } from '@/stores/authStore'
import { usePresenceStore } from '@/stores/presenceStore'
import { useUiStore } from '@/stores/uiStore'

const presence = {
  initPresence: vi.fn(),
  setDevicePresence: vi.fn(async () => {}),
  touchLastSeen: vi.fn(async () => {}),
  cleanupPresence: vi.fn(),
}
const initialUi = useUiStore.getState()

function setVisibility(state: 'hidden' | 'visible') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
}

const phone = (coarse: boolean) => vi.stubGlobal('matchMedia', vi.fn((q: string) => ({ matches: q === '(pointer: coarse)' && coarse })))

beforeEach(() => {
  document.body.innerHTML = '<div id="privacy-screen" style="display:none"></div>'
  Object.values(presence).forEach((f) => f.mockClear())
  usePresenceStore.setState(presence as never)
  useAuthStore.setState({ user: { id: 'alice' } as User, profile: { id: 'alice', presence_override: null } as never })
  useUiStore.setState(initialUi, true)
  useUiStore.setState({ eepMode: false, pinLocked: false, pinLength: 6, pinPadOpen: false })
  setVisibility('visible')
  clearExternalUi()
})
afterEach(() => {
  vi.unstubAllGlobals()
  setVisibility('visible')
})

/** Shows which screen is up, the way App does: the chat or the disguise. */
function Screen() {
  const eep = useUiStore((s) => s.eepMode)
  return <p data-testid="screen">{eep ? 'ff14' : 'chat'}</p>
}

describe('usePresence on the web', () => {
  it('the page going hidden swaps to the FF14 screen before the event handler returns', () => {
    phone(true)
    const { getByTestId } = render(<Screen />)
    renderHook(() => usePresence())
    expect(getByTestId('screen').textContent).toBe('chat')

    setVisibility('hidden')
    // No act() and no waiting: the DOM must already show the disguise when dispatchEvent returns, since iOS
    // snapshots and freezes the page right after.
    document.dispatchEvent(new Event('visibilitychange'))
    expect(getByTestId('screen').textContent).toBe('ff14')
    expect(document.getElementById('privacy-screen')!.style.display).toBe('flex')
    expect(presence.setDevicePresence).toHaveBeenCalledWith('offline')
  })

  it('a phone with a PIN comes back locked, with the PIN pad closed even if it was open', () => {
    phone(true)
    useUiStore.setState({ eepMode: true, pinLocked: false, pinPadOpen: true })
    renderHook(() => usePresence())
    setVisibility('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    setVisibility('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('pageshow'))
    expect(useUiStore.getState()).toMatchObject({ eepMode: true, pinLocked: true, pinPadOpen: false })
    expect(document.getElementById('privacy-screen')!.style.display).toBe('none')
  })

  it('pagehide alone (no visibilitychange) does the same', () => {
    phone(true)
    renderHook(() => usePresence())
    window.dispatchEvent(new Event('pagehide'))
    expect(useUiStore.getState()).toMatchObject({ eepMode: true, pinLocked: true, pinPadOpen: false })
  })

  it('a phone losing window focus is disguised and locked, unless the app opened what took it', () => {
    phone(true)
    renderHook(() => usePresence())
    expectExternalUi()
    window.dispatchEvent(new Event('blur'))
    expect(useUiStore.getState().eepMode).toBe(false)
    window.dispatchEvent(new Event('focus'))

    window.dispatchEvent(new Event('blur'))
    expect(useUiStore.getState()).toMatchObject({ eepMode: true, pinLocked: true })
  })

  it('a desktop tab going hidden is disguised but not locked, and a window blur changes nothing', () => {
    phone(false)
    renderHook(() => usePresence())
    window.dispatchEvent(new Event('blur'))
    expect(useUiStore.getState().eepMode).toBe(false)
    setVisibility('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(useUiStore.getState()).toMatchObject({ eepMode: true, pinLocked: false })
  })

  it('stops listening on unmount', () => {
    phone(true)
    const { unmount } = renderHook(() => usePresence())
    unmount()
    setVisibility('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('blur'))
    expect(useUiStore.getState().eepMode).toBe(false)
  })
})
