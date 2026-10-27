import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearExternalUi, externalUiExpected } from '@/lib/externalUi'
import { fileNameFor, mediaReady, prefetchMedia, proxyUrl, resetSaveCache, saveMedia } from '@/lib/saveMedia'

const CDN = 'https://cdn.example.net'

const ok = (type = 'image/jpeg') => ({ ok: true, status: 200, blob: async () => new Blob(['bytes'], { type }) })
const corsRefused = () => Promise.reject(new TypeError('Load failed'))

let fetchMock: ReturnType<typeof vi.fn>
let share: ReturnType<typeof vi.fn>
let canShare: ReturnType<typeof vi.fn>
let clicked: { href: string; download: string }[]
let opened: ReturnType<typeof vi.fn>

/** A phone: coarse pointer and file sharing. */
function phone() {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(pointer: coarse)' }))
  Object.defineProperty(navigator, 'share', { value: share, configurable: true })
  Object.defineProperty(navigator, 'canShare', { value: canShare, configurable: true })
}

const domError = (name: string) => Object.assign(new Error(name), { name })

beforeEach(() => {
  vi.stubEnv('VITE_BUNNY_CDN_URL', 'cdn.example.net')
  resetSaveCache()
  clearExternalUi()
  fetchMock = vi.fn(async () => ok())
  vi.stubGlobal('fetch', fetchMock)
  share = vi.fn(async () => {})
  canShare = vi.fn(() => true)
  clicked = []
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push({ href: this.href, download: this.download })
  })
  URL.createObjectURL = vi.fn(() => 'blob:local/1')
  URL.revokeObjectURL = vi.fn()
  opened = vi.fn(() => ({ opener: window }))
  vi.stubGlobal('open', opened)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  delete (navigator as { share?: unknown }).share
  delete (navigator as { canShare?: unknown }).canShare
})

describe('fileNameFor', () => {
  it("uses the attachment's name", () => {
    expect(fileNameFor({ url: `${CDN}/m/abc.jpg`, filename: 'Raid night.jpg' })).toBe('Raid night.jpg')
  })

  it("falls back to the URL's last part, decoded", () => {
    expect(fileNameFor({ url: `${CDN}/m/my%20clip.mov`, filename: null })).toBe('my clip.mov')
  })

  it('adds an extension from the type when the name has none', () => {
    expect(fileNameFor({ url: `${CDN}/m/x`, filename: 'voice memo' }, 'audio/mp4')).toBe('voice memo.m4a')
    expect(fileNameFor({ url: `${CDN}/m/x`, filename: 'shot' }, 'image/jpeg; charset=binary')).toBe('shot.jpg')
    expect(fileNameFor({ url: `${CDN}/m/x`, filename: 'blob' }, 'application/x-unknown')).toBe('blob')
  })

  it('never keeps a path separator', () => {
    expect(fileNameFor({ url: `${CDN}/m/x`, filename: '../a/b.png' })).toBe('.._a_b.png')
  })
})

describe('proxyUrl', () => {
  it('maps a CDN URL onto the same-origin proxy, with its query', () => {
    expect(proxyUrl(`${CDN}/messages/a b.mov?v=2`)).toBe('/cdn-proxy/messages/a%20b.mov?v=2')
  })

  it('refuses any other host', () => {
    expect(proxyUrl('https://evil.example.com/messages/a.mov')).toBeNull()
    expect(proxyUrl('https://cdn.example.net.evil.com/a.mov')).toBeNull()
  })

  it('accepts the env value with a scheme too', () => {
    vi.stubEnv('VITE_BUNNY_CDN_URL', 'https://cdn.example.net')
    expect(proxyUrl(`${CDN}/a.png`)).toBe('/cdn-proxy/a.png')
  })
})

describe('saveMedia on a desktop', () => {
  it('downloads the fetched file under its name', async () => {
    await expect(saveMedia({ url: `${CDN}/m/a.jpg`, filename: 'Sunset.jpg' })).resolves.toBe('saved')
    expect(fetchMock).toHaveBeenCalledWith(`${CDN}/m/a.jpg`, expect.objectContaining({ mode: 'cors' }))
    expect(clicked).toEqual([{ href: 'blob:local/1', download: 'Sunset.jpg' }])
    expect(share).not.toHaveBeenCalled()
  })

  it('goes through the proxy when the CDN refuses CORS', async () => {
    fetchMock.mockImplementationOnce(corsRefused).mockImplementationOnce(async () => ok('video/quicktime'))
    await expect(saveMedia({ url: `${CDN}/m/clip.mov`, filename: 'clip.mov' })).resolves.toBe('saved')
    expect(fetchMock).toHaveBeenLastCalledWith('/cdn-proxy/m/clip.mov', expect.anything())
    expect(clicked[0].download).toBe('clip.mov')
  })

  it('opens the file in a new tab when no fetch works', async () => {
    fetchMock.mockImplementation(corsRefused)
    await expect(saveMedia({ url: `${CDN}/m/a.pdf`, filename: 'a.pdf' })).resolves.toBe('opened')
    expect(opened).toHaveBeenCalledWith(`${CDN}/m/a.pdf`, '_blank')
    expect(clicked).toEqual([])
  })

  it('never proxies another host', async () => {
    fetchMock.mockImplementation(corsRefused)
    await saveMedia({ url: 'https://elsewhere.example.com/a.pdf' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('says it failed when even the new tab is blocked', async () => {
    fetchMock.mockImplementation(corsRefused)
    opened.mockReturnValue(null)
    await expect(saveMedia({ url: `${CDN}/m/a.pdf` })).resolves.toBe('failed')
  })

  it('does not prefetch (nothing needs the tap to stay fresh)', () => {
    prefetchMedia({ url: `${CDN}/m/a.jpg` })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('saveMedia on a phone', () => {
  beforeEach(phone)

  it('shares the file, with the disguise held off while the sheet is up', async () => {
    let expectedDuring = false
    share.mockImplementation(async () => {
      expectedDuring = externalUiExpected()
    })
    await expect(saveMedia({ url: `${CDN}/m/a.jpg`, filename: 'a.jpg' })).resolves.toBe('saved')
    const [{ files }] = share.mock.calls[0] as [{ files: File[] }]
    expect(files[0].name).toBe('a.jpg')
    expect(files[0].type).toBe('image/jpeg')
    expect(expectedDuring).toBe(true)
    expect(externalUiExpected()).toBe(false)
    expect(clicked).toEqual([])
  })

  it('guesses the type from the name when the response gives none (iOS needs it for Save to Photos)', async () => {
    fetchMock.mockImplementation(async () => ok(''))
    await saveMedia({ url: `${CDN}/m/clip.mov`, filename: 'clip.mov' })
    const [{ files }] = share.mock.calls[0] as [{ files: File[] }]
    expect(files[0].type).toBe('video/quicktime')
  })

  it('a dismissed share sheet is no failure', async () => {
    share.mockRejectedValue(domError('AbortError'))
    await expect(saveMedia({ url: `${CDN}/m/a.jpg` })).resolves.toBe('cancelled')
    expect(clicked).toEqual([])
    expect(externalUiExpected()).toBe(false)
  })

  it('a share refused for a stale tap asks for another; that tap shares at once', async () => {
    share.mockRejectedValueOnce(domError('NotAllowedError'))
    await expect(saveMedia({ url: `${CDN}/m/clip.mov` })).resolves.toBe('again')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const second = saveMedia({ url: `${CDN}/m/clip.mov` })
    // Synchronously, inside the tap: no fetch first.
    expect(share).toHaveBeenCalledTimes(2)
    await expect(second).resolves.toBe('saved')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('a prefetched file shares synchronously', async () => {
    prefetchMedia({ url: `${CDN}/m/a.jpg` })
    await vi.waitFor(() => expect(mediaReady(`${CDN}/m/a.jpg`)).toBe(true))
    void saveMedia({ url: `${CDN}/m/a.jpg` })
    expect(share).toHaveBeenCalledTimes(1)
  })

  it('skips prefetching a big file', () => {
    prefetchMedia({ url: `${CDN}/m/long.mov`, size: 200 * 1024 * 1024 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('downloads when the file cannot be shared', async () => {
    canShare.mockReturnValue(false)
    await expect(saveMedia({ url: `${CDN}/m/a.zip`, filename: 'a.zip' })).resolves.toBe('saved')
    expect(share).not.toHaveBeenCalled()
    expect(clicked[0].download).toBe('a.zip')
  })

  it('downloads when sharing fails some other way', async () => {
    share.mockRejectedValue(new TypeError('nope'))
    await expect(saveMedia({ url: `${CDN}/m/a.jpg`, filename: 'a.jpg' })).resolves.toBe('saved')
    expect(clicked[0].download).toBe('a.jpg')
  })

  it('a failed fetch is not cached', async () => {
    fetchMock.mockImplementation(corsRefused)
    await saveMedia({ url: `${CDN}/m/a.jpg` })
    fetchMock.mockImplementation(async () => ok())
    await expect(saveMedia({ url: `${CDN}/m/a.jpg` })).resolves.toBe('saved')
    expect(share).toHaveBeenCalledTimes(1)
  })
})
