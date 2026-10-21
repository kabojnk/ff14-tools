import type { BundleInfo } from '@capgo/capacitor-updater'
import { onAppStateChange } from '@/lib/appLifecycle'

/** /native/latest.json, written by scripts/native-bundle.mjs in the Docker build. */
export interface UpdateManifest {
  version: string
  /** The zip, relative to the manifest's own URL. */
  url: string
  /** sha256 of the zip, hex. */
  checksum: string
  /** The oldest app shell (CFBundleShortVersionString) this bundle works with. */
  minNative: string
}

export type UpdateResult = 'up-to-date' | 'queued' | 'too-new' | 'failed-before' | 'error'

export interface UpdaterDeps {
  manifestUrl: string
  /** The running bundle's version (__BUNDLE_VERSION__). */
  bundleVersion: string
  fetchJson: (url: string) => Promise<unknown>
  nativeVersion: () => Promise<string>
  bundles: () => Promise<BundleInfo[]>
  download: (o: { url: string; version: string; checksum: string }) => Promise<BundleInfo>
  next: (id: string) => Promise<void>
  /** Deletes a bundle (a download left unfinished by an earlier run). */
  remove: (id: string) => Promise<void>
}

const STAMP = /-(\d{14})$/

/** Bundle versions are `<package version>-<UTC stamp YYYYMMDDHHmmss>`; the stamp orders them. */
export function stampOf(version: string): number | null {
  const m = STAMP.exec(version)
  return m ? Number(m[1]) : null
}

/** Dotted numeric comparison (-1, 0, 1). Missing or non-numeric parts count as 0. */
export function compareNative(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d < 0 ? -1 : 1
  }
  return 0
}

export function parseManifest(json: unknown): UpdateManifest | null {
  if (!json || typeof json !== 'object') return null
  const m = json as Record<string, unknown>
  const str = (k: string) => (typeof m[k] === 'string' && m[k] !== '' ? (m[k] as string) : null)
  const version = str('version')
  const url = str('url')
  const checksum = str('checksum')
  const minNative = str('minNative')
  if (!version || !url || !checksum || !minNative) return null
  if (!/^[0-9a-f]{64}$/.test(checksum) || stampOf(version) === null) return null
  return { version, url, checksum, minNative }
}

/**
 * One update check: a newer bundle that suits this app shell is downloaded (checksum-verified by the
 * plugin) and queued with next(), so it's applied the next time the app goes to the background, behind
 * the disguise. Any failure keeps the current bundle; the next resume tries again.
 */
export async function checkForUpdate(d: UpdaterDeps): Promise<UpdateResult> {
  try {
    const manifest = parseManifest(await d.fetchJson(d.manifestUrl))
    if (!manifest) throw new Error('bad manifest')
    if ((stampOf(manifest.version) ?? 0) <= (stampOf(d.bundleVersion) ?? 0)) return 'up-to-date'
    if (compareNative(await d.nativeVersion(), manifest.minNative) < 0) return 'too-new'

    const known = (await d.bundles()).find((b) => b.version === manifest.version)
    // A version that failed here before is never retried; the next deploy brings a new version.
    if (known?.status === 'error') return 'failed-before'
    if (known?.status === 'downloading') await d.remove(known.id)
    const bundle =
      known && (known.status === 'pending' || known.status === 'success')
        ? known
        : await d.download({
            url: new URL(manifest.url, d.manifestUrl).href,
            version: manifest.version,
            checksum: manifest.checksum,
          })
    await d.next(bundle.id)
    return 'queued'
  } catch (e) {
    console.warn('[updates] check failed; keeping the current bundle', e)
    return 'error'
  }
}

/** Checks on launch and on every resume. Off when VITE_NATIVE_UPDATE_URL isn't set. */
export function startUpdates(): void {
  const base = import.meta.env.VITE_NATIVE_UPDATE_URL
  if (!base) {
    console.info('[updates] VITE_NATIVE_UPDATE_URL is not set; live updates are off')
    return
  }
  const manifestUrl = new URL('/native/latest.json', base).href
  let running: Promise<UpdateResult> | null = null
  const run = () => {
    running ??= import('@capgo/capacitor-updater')
      .then(({ CapacitorUpdater }) =>
        checkForUpdate({
          manifestUrl,
          bundleVersion: __BUNDLE_VERSION__,
          fetchJson: async (url) => {
            const res = await fetch(url, { cache: 'no-store' })
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            return res.json()
          },
          nativeVersion: async () => (await CapacitorUpdater.current()).native,
          bundles: async () => (await CapacitorUpdater.list()).bundles,
          download: (o) => CapacitorUpdater.download(o),
          next: async (id) => {
            await CapacitorUpdater.next({ id })
          },
          remove: (id) => CapacitorUpdater.delete({ id }),
        }),
      )
      .finally(() => {
        running = null
      })
  }
  run()
  onAppStateChange((active) => {
    if (active) run()
  })
}
