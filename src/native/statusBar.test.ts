import { describe, expect, it, vi } from 'vitest'
import { followStatusBar, statusBarStyleFor } from '@/native/statusBar'
import { DISGUISE_BAR, LOADING_BG } from '@/lib/themes'

describe('statusBarStyleFor', () => {
  it('uses light text on dark bars and dark text on light ones', () => {
    expect(statusBarStyleFor(DISGUISE_BAR)).toBe('DARK')
    expect(statusBarStyleFor(LOADING_BG)).toBe('DARK')
    expect(statusBarStyleFor('#3b4252')).toBe('DARK')
    expect(statusBarStyleFor('#ffffff')).toBe('LIGHT')
    expect(statusBarStyleFor('#e6e9ef')).toBe('LIGHT')
    expect(statusBarStyleFor('#fff')).toBe('LIGHT')
  })
  it('falls back to light text for anything it cannot read', () => {
    expect(statusBarStyleFor('rebeccapurple')).toBe('DARK')
  })
})

describe('followStatusBar', () => {
  it('applies the current theme-color, then every change to it', async () => {
    document.head.innerHTML = '<meta name="theme-color" content="#1a1a2e">'
    const setStyle = vi.fn()
    const stop = followStatusBar(document, setStyle)
    expect(setStyle).toHaveBeenLastCalledWith('DARK')
    document.querySelector('meta[name="theme-color"]')!.setAttribute('content', '#ffffff')
    await vi.waitFor(() => expect(setStyle).toHaveBeenLastCalledWith('LIGHT'))
    stop()
    document.head.innerHTML = ''
  })

  it('picks up the meta tag when the app adds it later', async () => {
    document.head.innerHTML = ''
    const setStyle = vi.fn()
    const stop = followStatusBar(document, setStyle)
    expect(setStyle).not.toHaveBeenCalled()
    const meta = document.createElement('meta')
    meta.name = 'theme-color'
    meta.content = '#ffffff'
    document.head.appendChild(meta)
    await vi.waitFor(() => expect(setStyle).toHaveBeenCalledWith('LIGHT'))
    stop()
    document.head.innerHTML = ''
  })
})
