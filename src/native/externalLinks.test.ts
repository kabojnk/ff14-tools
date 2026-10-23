import { afterEach, describe, expect, it, vi } from 'vitest'
import { installExternalLinks } from '@/native/externalLinks'

let stop = () => {}
afterEach(() => {
  stop()
  document.body.innerHTML = ''
})

function click(html: string) {
  document.body.innerHTML = html
  const a = document.querySelector('a')!
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })
  ;(a.querySelector('span') ?? a).dispatchEvent(event)
  return event
}

describe('installExternalLinks', () => {
  it('opens a new-tab web link in Safari instead of the app', () => {
    const open = vi.fn()
    stop = installExternalLinks(document, open)
    const e = click('<a href="https://example.com/x" target="_blank"><span>link</span></a>')
    expect(e.defaultPrevented).toBe(true)
    expect(open).toHaveBeenCalledWith('https://example.com/x')
  })

  it('opens a link to another site even without target=_blank', () => {
    const open = vi.fn()
    stop = installExternalLinks(document, open)
    click('<a href="https://example.com/">x</a>')
    expect(open).toHaveBeenCalledWith('https://example.com/')
  })

  it('leaves same-origin links, non-web links and handled clicks alone', () => {
    const open = vi.fn()
    stop = installExternalLinks(document, open)
    expect(click(`<a href="${location.origin}/inside">x</a>`).defaultPrevented).toBe(false)
    expect(click('<a href="mailto:a@b.c" target="_blank">x</a>').defaultPrevented).toBe(false)
    document.body.innerHTML = '<a href="https://example.com" target="_blank">x</a>'
    const a = document.querySelector('a')!
    a.addEventListener('click', (ev) => ev.preventDefault())
    a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(open).not.toHaveBeenCalled()
  })

  it('stops when uninstalled', () => {
    const open = vi.fn()
    installExternalLinks(document, open)()
    click('<a href="https://example.com/" target="_blank">x</a>')
    expect(open).not.toHaveBeenCalled()
  })
})
