import { afterEach, describe, expect, it, vi } from 'vitest'
import { isNativeApp } from '@/lib/platform'

type CapWindow = Window & { Capacitor?: { isNativePlatform?: () => boolean } }

afterEach(() => {
  vi.unstubAllEnvs()
  delete (window as CapWindow).Capacitor
})

describe('isNativeApp', () => {
  it('is false in a website build, even with a Capacitor global', () => {
    vi.stubEnv('MODE', 'production')
    ;(window as CapWindow).Capacitor = { isNativePlatform: () => true }
    expect(isNativeApp()).toBe(false)
  })

  it('is false in a native build opened in a browser', () => {
    vi.stubEnv('MODE', 'native')
    expect(isNativeApp()).toBe(false)
    ;(window as CapWindow).Capacitor = { isNativePlatform: () => false }
    expect(isNativeApp()).toBe(false)
  })

  it('is true in a native build inside the app', () => {
    vi.stubEnv('MODE', 'native')
    ;(window as CapWindow).Capacitor = { isNativePlatform: () => true }
    expect(isNativeApp()).toBe(true)
  })
})
