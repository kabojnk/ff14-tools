import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Implementations go inside vi.fn(): the config's restoreMocks resets mocks to those before each test.
const native = vi.hoisted(() => {
  const handlers: Record<string, (s?: { isActive: boolean }) => void> = {}
  return {
    handlers,
    addListener: vi.fn(async (event: string, h: (s?: { isActive: boolean }) => void) => {
      handlers[event] = h
      return { remove: vi.fn() }
    }),
    getState: vi.fn(async () => ({ isActive: true })),
  }
})
vi.mock('@capacitor/app', () => ({ App: { addListener: native.addListener, getState: native.getState } }))

type CapWindow = Window & { Capacitor?: { isNativePlatform?: () => boolean } }

async function load() {
  vi.resetModules()
  return import('@/lib/appLifecycle')
}
function inApp() {
  vi.stubEnv('MODE', 'native')
  ;(window as CapWindow).Capacitor = { isNativePlatform: () => true }
}

beforeEach(() => {
  for (const k of Object.keys(native.handlers)) delete native.handlers[k]
  native.addListener.mockClear()
  native.getState.mockResolvedValue({ isActive: true })
})
afterEach(() => {
  vi.unstubAllEnvs()
  delete (window as CapWindow).Capacitor
})

describe('onAppStateChange', () => {
  it('never subscribes outside the app', async () => {
    const { onAppStateChange } = await load()
    const stop = onAppStateChange(vi.fn())
    await Promise.resolve()
    expect(native.addListener).not.toHaveBeenCalled()
    stop()
  })

  it('in the app, pause and resume fan out to every subscriber until they stop', async () => {
    inApp()
    const { onAppStateChange } = await load()
    const a = vi.fn()
    const b = vi.fn()
    const stopA = onAppStateChange(a)
    onAppStateChange(b)
    await vi.waitFor(() => expect(native.handlers.resume).toBeDefined())
    expect(native.addListener).toHaveBeenCalledTimes(3) // pause, resume, appStateChange: one set for everyone

    native.handlers.pause()
    expect(a).toHaveBeenCalledWith(false)
    expect(b).toHaveBeenCalledWith(false)

    stopA()
    native.handlers.resume()
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenLastCalledWith(true)
  })

  it('an interruption that never leaves the foreground (Control Center, a permission prompt) is not "background"', async () => {
    inApp()
    const { onAppStateChange } = await load()
    const cb = vi.fn()
    onAppStateChange(cb)
    await vi.waitFor(() => expect(native.handlers.appStateChange).toBeDefined())
    native.handlers.appStateChange({ isActive: false })
    native.handlers.appStateChange({ isActive: true })
    // Becoming active reports "foreground" once (it also settles a cold start); inactive alone reports nothing.
    expect(cb.mock.calls).toEqual([[true]])
  })

  it('reports each change once, however many native events say it', async () => {
    inApp()
    const { onAppStateChange } = await load()
    const cb = vi.fn()
    onAppStateChange(cb)
    await vi.waitFor(() => expect(native.handlers.resume).toBeDefined())
    native.handlers.pause()
    native.handlers.resume()
    native.handlers.appStateChange({ isActive: true })
    expect(cb.mock.calls).toEqual([[false], [true]])
  })
})

describe('appIsActive', () => {
  it('is true outside the app', async () => {
    const { appIsActive } = await load()
    await expect(appIsActive()).resolves.toBe(true)
  })

  it('asks the app in the app (a page can start in the background after an update reload)', async () => {
    inApp()
    native.getState.mockResolvedValue({ isActive: false })
    const { appIsActive } = await load()
    await expect(appIsActive()).resolves.toBe(false)
  })
})
