import { clearExternalUi, expectExternalUi } from '@/lib/externalUi'

/** What a save needs: the file's address, its name when known, and its size (prefetching skips big files). */
export interface SaveTarget {
  url: string
  filename?: string | null
  size?: number
}

/**
 * - saved: shared (the person picked where it goes) or downloaded
 * - cancelled: the share sheet was dismissed
 * - again: Safari refused the share sheet because the fetch outlasted the tap; the file is ready now, so
 *   the next tap shares it at once
 * - opened: the file couldn't be fetched, so it opened in a new tab instead
 * - failed: nothing worked
 */
export type SaveResult = 'saved' | 'cancelled' | 'again' | 'opened' | 'failed'

/** The same-origin path that fetches CDN files whose responses lack CORS headers (docker/nginx.conf, vite.config.ts). */
export const CDN_PROXY_PATH = '/cdn-proxy'

/** Files fetched for a save, newest last. A few, so the viewer's neighbours and a re-tap hit it. */
const CACHE_SIZE = 3
/** Prefetching (before any tap) stops at this size: a long video isn't worth fetching just in case. */
const PREFETCH_MAX_BYTES = 25 * 1024 * 1024

const TYPES: [ext: string, mime: string][] = [
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['png', 'image/png'],
  ['gif', 'image/gif'],
  ['webp', 'image/webp'],
  ['heic', 'image/heic'],
  ['heif', 'image/heif'],
  ['mp4', 'video/mp4'],
  ['mov', 'video/quicktime'],
  ['m4v', 'video/x-m4v'],
  ['webm', 'video/webm'],
  ['m4a', 'audio/mp4'],
  ['mp3', 'audio/mpeg'],
  ['ogg', 'audio/ogg'],
  ['wav', 'audio/wav'],
  ['aac', 'audio/aac'],
  ['pdf', 'application/pdf'],
  ['zip', 'application/zip'],
  ['txt', 'text/plain'],
]

const extensionOf = (name: string) => /\.([a-z0-9]{1,5})$/i.exec(name)?.[1].toLowerCase() ?? null

function lastSegment(url: string): string {
  try {
    const seg = new URL(url, window.location.href).pathname.split('/').pop() ?? ''
    try {
      return decodeURIComponent(seg)
    } catch {
      return seg
    }
  } catch {
    return ''
  }
}

/** The saved file's name: the attachment's, else the URL's last part, with an extension from the type if it has none. */
export function fileNameFor(target: SaveTarget, mime = ''): string {
  const name = (target.filename?.trim() || lastSegment(target.url) || 'download').replace(/[/\\]/g, '_')
  if (extensionOf(name)) return name
  const bare = mime.split(';')[0].trim().toLowerCase()
  const ext = TYPES.find(([, m]) => m === bare)?.[0]
  return ext ? `${name}.${ext}` : name
}

/** The type a name suggests, for a response that didn't say (iOS offers "Save Image" only for an image type). */
function typeFor(name: string): string {
  const ext = extensionOf(name)
  return TYPES.find(([e]) => e === ext)?.[1] ?? 'application/octet-stream'
}

function cdnHost(): string | null {
  const raw = import.meta.env.VITE_BUNNY_CDN_URL
  if (!raw) return null
  try {
    // The value may come with or without its scheme.
    return new URL(raw.includes('://') ? raw : `https://${raw}`).host
  } catch {
    return null
  }
}

/** The same-origin proxy's address for a file on the CDN; null for anything else (the proxy only reaches the CDN). */
export function proxyUrl(url: string): string | null {
  const host = cdnHost()
  if (!host) return null
  try {
    const u = new URL(url)
    return u.host === host ? `${CDN_PROXY_PATH}${u.pathname}${u.search}` : null
  } catch {
    return null
  }
}

/** Straight from the CDN when it sends CORS headers (images, mp4), else through the proxy (mov, m4a, pdf…). */
async function fetchBlob(url: string): Promise<Blob> {
  try {
    const res = await fetch(url, { mode: 'cors', credentials: 'omit' })
    if (res.ok) return await res.blob()
  } catch {
    // Refused for want of CORS headers (or offline): the proxy may still get it.
  }
  const via = proxyUrl(url)
  if (!via) throw new Error(`Couldn't fetch ${url}`)
  const res = await fetch(via, { credentials: 'omit' })
  if (!res.ok) throw new Error(`Couldn't fetch ${url}: ${res.status}`)
  return res.blob()
}

async function fetchFile(target: SaveTarget): Promise<File> {
  const blob = await fetchBlob(target.url)
  const said = blob.type && blob.type !== 'application/octet-stream' ? blob.type.split(';')[0] : ''
  const name = fileNameFor(target, said)
  return new File([blob], name, { type: said || typeFor(name) })
}

type Entry = { promise: Promise<File>; file?: File }
const cache = new Map<string, Entry>()

function load(target: SaveTarget): Promise<File> {
  const hit = cache.get(target.url)
  if (hit) {
    // Most recently used goes last.
    cache.delete(target.url)
    cache.set(target.url, hit)
    return hit.promise
  }
  const entry: Entry = { promise: fetchFile(target) }
  entry.promise.then(
    (file) => (entry.file = file),
    () => {
      if (cache.get(target.url) === entry) cache.delete(target.url)
    },
  )
  cache.set(target.url, entry)
  while (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!)
  return entry.promise
}

/** Phones share the file (iOS's sheet has Save Image/Video → Photos, Save to Files); desktops download it. */
function sharesFiles(): boolean {
  return (
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    window.matchMedia?.('(pointer: coarse)').matches === true
  )
}

/** Fetches a file ahead of a tap, where the share sheet will want it (phones): see saveMedia. */
export function prefetchMedia(target: SaveTarget): void {
  if (!sharesFiles() || (target.size ?? 0) > PREFETCH_MAX_BYTES) return
  load(target).catch(() => {})
}

function download(file: File): void {
  const href = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = href
  a.download = file.name
  a.style.display = 'none'
  document.body.append(a)
  a.click()
  a.remove()
  // Later, not now: a browser may still be reading the blob after click() returns.
  window.setTimeout(() => URL.revokeObjectURL(href), 60_000)
}

function deliver(file: File): Promise<SaveResult> {
  if (sharesFiles() && navigator.canShare({ files: [file] })) {
    // The share sheet takes the window's focus: not a reason to put the disguise up.
    expectExternalUi()
    let shared: Promise<void>
    try {
      shared = navigator.share({ files: [file] })
    } catch (e) {
      shared = Promise.reject(e)
    }
    return shared
      .then(
        (): SaveResult => 'saved',
        (e: unknown): SaveResult => {
          const name = (e as { name?: unknown } | null)?.name
          if (name === 'AbortError') return 'cancelled'
          if (name === 'NotAllowedError') return 'again'
          download(file)
          return 'saved'
        },
      )
      .finally(clearExternalUi)
  }
  download(file)
  return Promise.resolve('saved')
}

function openInstead(url: string): SaveResult {
  // On a phone the page that opens takes the focus too.
  expectExternalUi()
  const win = window.open(url, '_blank')
  if (!win) {
    clearExternalUi()
    return 'failed'
  }
  win.opener = null
  return 'opened'
}

/**
 * Saves a media file: shared on phones (Photos or Files), downloaded on desktops, opened in a new tab
 * when it can't be fetched. Safari wants the share sheet opened while the tap is still fresh, so a
 * file fetched earlier (prefetchMedia, or a slow first tap) is shared synchronously, inside the tap.
 */
export function saveMedia(target: SaveTarget): Promise<SaveResult> {
  const ready = cache.get(target.url)?.file
  if (ready) return deliver(ready)
  return load(target).then(deliver, () => openInstead(target.url))
}

/** The file is fetched: saving it now shares synchronously. */
export function mediaReady(url: string): boolean {
  return !!cache.get(url)?.file
}

/** Tests: forget every fetched file. */
export function resetSaveCache(): void {
  cache.clear()
}
