import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@supabase/supabase-js'

const app = vi.hoisted(() => ({
  listener: null as null | ((active: boolean) => void),
  stop: vi.fn(),
  active: true,
}))
const realtime = vi.hoisted(() => ({ isConnected: vi.fn(() => false), connect: vi.fn() }))
vi.mock('@/lib/platform', () => ({ isNativeApp: () => true }))
vi.mock('@/lib/appLifecycle', () => ({
  onAppStateChange: (l: (active: boolean) => void) => {
    app.listener = l
    return app.stop
  },
  appIsActive: async () => app.active,
}))
vi.mock('@/lib/supabase', () => ({ supabase: { realtime } }))

import { usePresence } from '@/hooks/usePresence'
import { useAuthStore } from '@/stores/authStore'
import { usePresenceStore } from '@/stores/presenceStore'
import { useUiStore } from '@/stores/uiStore'

const presence = {
  initPresence: vi.fn(),
  setDevicePresence: vi.fn(async () => {}),
  touchLastSeen: vi.fn(async () => {}),
  cleanupPresence: vi.fn(),
}

beforeEach(() => {
  document.body.innerHTML = '<div id="privacy-screen" style="display:none"></div>'
  app.listener = null
  app.active = true
  app.stop.mockClear()
  realtime.isConnected.mockReturnValue(false)
  realtime.connect.mockClear()
  Object.values(presence).forEach((f) => f.mockClear())
  usePresenceStore.setState(presence as never)
  useAuthStore.setState({ user: { id: 'alice' } as User, profile: { id: 'alice', presence_override: null } as never })
  useUiStore.setState({ eepMode: false })
})
afterEach(() => {
  document.body.innerHTML = ''
})

const screenEl = () => document.getElementById('privacy-screen')!

describe('usePresence in the iOS app', () => {
  it('going to the background covers the screen, goes offline and puts up the disguise', () => {
    renderHook(() => usePresence())
    app.listener!(false)
    expect(screenEl().style.display).toBe('flex')
    expect(presence.setDevicePresence).toHaveBeenCalledWith('offline')
    // Once on start, once on going to the background.
    expect(presence.touchLastSeen).toHaveBeenCalledTimes(2)
    expect(useUiStore.getState().eepMode).toBe(true)
  })

  it('coming back uncovers, goes online and reconnects realtime if the socket dropped', () => {
    renderHook(() => usePresence())
    app.listener!(false)
    app.listener!(true)
    expect(screenEl().style.display).toBe('none')
    expect(presence.setDevicePresence).toHaveBeenLastCalledWith('online')
    expect(realtime.connect).toHaveBeenCalledTimes(1)
    // The disguise stays up until the passphrase or PIN.
    expect(useUiStore.getState().eepMode).toBe(true)
  })

  it('does not reconnect a socket that is still connected', () => {
    realtime.isConnected.mockReturnValue(true)
    renderHook(() => usePresence())
    app.listener!(true)
    expect(realtime.connect).not.toHaveBeenCalled()
  })

  it('a page that starts in the background (an update reload) is covered, offline and disguised at once', async () => {
    app.active = false
    renderHook(() => usePresence())
    await vi.waitFor(() => expect(presence.setDevicePresence).toHaveBeenCalledWith('offline'))
    expect(useUiStore.getState().eepMode).toBe(true)
    expect(screenEl().style.display).toBe('flex')
  })

  it('a page that starts in the foreground stays online', async () => {
    renderHook(() => usePresence())
    await Promise.resolve()
    await Promise.resolve()
    expect(presence.setDevicePresence).not.toHaveBeenCalledWith('offline')
  })

  it('ignores the web events, and stops listening on unmount', () => {
    const { unmount } = renderHook(() => usePresence())
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('pagehide'))
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    expect(presence.setDevicePresence).not.toHaveBeenCalled()
    expect(useUiStore.getState().eepMode).toBe(false)
    unmount()
    expect(app.stop).toHaveBeenCalledTimes(1)
  })
})
