import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const calls = vi.hoisted(() => ({ order: [] as string[] }))
const privacy = vi.hoisted(() => ({ enable: vi.fn(async () => { calls.order.push('privacy'); return { success: true } }) }))
const updater = vi.hoisted(() => ({ notifyAppReady: vi.fn(async () => { calls.order.push('ready'); return { bundle: {} } }) }))
const browser = vi.hoisted(() => ({ open: vi.fn(async () => {}) }))
const statusBar = vi.hoisted(() => ({ setStyle: vi.fn(async () => {}) }))
const updates = vi.hoisted(() => ({ startUpdates: vi.fn(() => calls.order.push('updates')) }))
let native = true
vi.mock('@/lib/platform', () => ({ isNativeApp: () => native }))
vi.mock('@capacitor/privacy-screen', () => ({ PrivacyScreen: privacy }))
vi.mock('@capgo/capacitor-updater', () => ({ CapacitorUpdater: updater }))
vi.mock('@capacitor/browser', () => ({ Browser: browser }))
vi.mock('@capacitor/status-bar', () => ({ StatusBar: statusBar, Style: { Dark: 'DARK', Light: 'LIGHT' } }))
vi.mock('@/native/updates', () => updates)

import { startNative } from '@/native/bootstrap'

beforeEach(() => {
  native = true
  calls.order = []
  vi.clearAllMocks()
  document.body.innerHTML = '<div id="root"><main>app</main></div>'
  document.head.innerHTML = '<meta name="theme-color" content="#1a1a2e">'
})
afterEach(() => {
  document.body.innerHTML = ''
  document.head.innerHTML = ''
})

describe('startNative', () => {
  it('covers the switcher, follows links and the status bar, keeps the bundle, then checks for updates', async () => {
    const stop = await startNative()
    expect(privacy.enable).toHaveBeenCalledWith({ ios: { blurEffect: 'none' } })
    await vi.waitFor(() => expect(calls.order).toEqual(['privacy', 'ready', 'updates']))
    expect(updates.startUpdates).toHaveBeenCalledTimes(1)
    expect(statusBar.setStyle).toHaveBeenCalledWith({ style: 'DARK' })

    document.body.insertAdjacentHTML('beforeend', '<a href="https://example.com/" target="_blank">x</a>')
    document.querySelector('a')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await vi.waitFor(() => expect(browser.open).toHaveBeenCalledWith({ url: 'https://example.com/' }))
    stop()
  })

  it('does not keep a bundle that never rendered (so the updater rolls it back)', async () => {
    document.body.innerHTML = '<div id="root"></div>'
    const stop = await startNative()
    await new Promise((r) => setTimeout(r, 50))
    expect(updater.notifyAppReady).not.toHaveBeenCalled()
    expect(updates.startUpdates).not.toHaveBeenCalled()
    // …and confirms as soon as React does render, however late (a page started in the background).
    document.getElementById('root')!.innerHTML = '<main>app</main>'
    await vi.waitFor(() => expect(updates.startUpdates).toHaveBeenCalledTimes(1))
    // Later renders don't confirm again or start a second update checker.
    document.getElementById('root')!.insertAdjacentHTML('beforeend', '<aside>more</aside>')
    await new Promise((r) => setTimeout(r, 20))
    expect(updater.notifyAppReady).toHaveBeenCalledTimes(1)
    expect(updates.startUpdates).toHaveBeenCalledTimes(1)
    stop()
  })

  it('a privacy plugin that never answers does not hold up notifyAppReady', async () => {
    privacy.enable.mockReturnValueOnce(new Promise(() => {}))
    const stop = await startNative()
    await vi.waitFor(() => expect(updater.notifyAppReady).toHaveBeenCalled())
    await vi.waitFor(() => expect(updates.startUpdates).toHaveBeenCalledTimes(1))
    stop()
  })

  it('a failing privacy plugin does not stop the rest', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    privacy.enable.mockRejectedValueOnce(new Error('nope'))
    const stop = await startNative()
    await vi.waitFor(() => expect(updater.notifyAppReady).toHaveBeenCalled())
    expect(warn).toHaveBeenCalled()
    stop()
  })

  it('does nothing outside the app', async () => {
    native = false
    const stop = await startNative()
    expect(privacy.enable).not.toHaveBeenCalled()
    expect(updater.notifyAppReady).not.toHaveBeenCalled()
    stop()
  })
})
