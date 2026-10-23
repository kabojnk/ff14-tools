import { describe, expect, it, vi } from 'vitest'
import { checkForUpdate, compareNative, parseManifest, stampOf, type UpdaterDeps } from '@/native/updates'

const SUM = 'a'.repeat(64)
const MANIFEST_URL = 'https://xiv.example/native/latest.json'
const manifest = (over: Record<string, unknown> = {}) => ({
  version: '0.1.0-20261021090000',
  url: 'bundle-0.1.0-20261021090000.zip',
  checksum: SUM,
  minNative: '1.0.0',
  ...over,
})

function deps(over: Partial<UpdaterDeps> = {}): UpdaterDeps {
  return {
    manifestUrl: MANIFEST_URL,
    bundleVersion: '0.1.0-20261020090000',
    fetchJson: vi.fn(async () => manifest()),
    nativeVersion: vi.fn(async () => '1.0.0'),
    bundles: vi.fn(async () => []),
    download: vi.fn(async (o: { url: string; version: string; checksum: string }) => ({ id: 'b1', version: o.version, downloaded: '', checksum: SUM, status: 'pending' as const })),
    next: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    ...over,
  }
}

describe('parseManifest', () => {
  it('accepts a complete manifest', () => {
    expect(parseManifest(manifest())).toEqual(manifest())
  })
  it.each([
    ['not an object', 'nope'],
    ['a missing field', { ...manifest(), minNative: undefined }],
    ['an empty url', manifest({ url: '' })],
    ['a short checksum', manifest({ checksum: 'abc' })],
    ['a version without a stamp', manifest({ version: '0.1.0' })],
  ])('rejects %s', (_label, json) => {
    expect(parseManifest(json)).toBeNull()
  })
})

describe('version rules', () => {
  it('reads the stamp off a bundle version', () => {
    expect(stampOf('0.1.0-20261021090000')).toBe(20261021090000)
    expect(stampOf('0.1.0-dev')).toBeNull()
  })
  it('compares native versions part by part', () => {
    expect(compareNative('1.0.0', '1.0.0')).toBe(0)
    expect(compareNative('1.0', '1.0.0')).toBe(0)
    expect(compareNative('1.2.0', '1.10.0')).toBe(-1)
    expect(compareNative('2.0.0', '1.9.9')).toBe(1)
  })
})

describe('checkForUpdate', () => {
  it('downloads a newer bundle (url resolved against the manifest) and queues it for the next background', async () => {
    const d = deps()
    await expect(checkForUpdate(d)).resolves.toBe('queued')
    expect(d.download).toHaveBeenCalledWith({
      url: 'https://xiv.example/native/bundle-0.1.0-20261021090000.zip',
      version: '0.1.0-20261021090000',
      checksum: SUM,
    })
    expect(d.next).toHaveBeenCalledWith('b1')
  })

  it('does nothing when the server bundle is not newer than this one', async () => {
    const d = deps({ bundleVersion: '0.1.0-20261021090000' })
    await expect(checkForUpdate(d)).resolves.toBe('up-to-date')
    const older = deps({ bundleVersion: '0.2.0-20261022090000' })
    await expect(checkForUpdate(older)).resolves.toBe('up-to-date')
    expect(d.download).not.toHaveBeenCalled()
    expect(older.download).not.toHaveBeenCalled()
  })

  it('treats a dev bundle as older than any published one', async () => {
    await expect(checkForUpdate(deps({ bundleVersion: '0.1.0-dev' }))).resolves.toBe('queued')
  })

  it('skips a bundle that needs a newer app shell', async () => {
    const d = deps({ fetchJson: vi.fn(async () => manifest({ minNative: '1.1.0' })) })
    await expect(checkForUpdate(d)).resolves.toBe('too-new')
    expect(d.download).not.toHaveBeenCalled()
  })

  it('re-queues an already downloaded bundle without downloading it again', async () => {
    const d = deps({ bundles: vi.fn(async () => [{ id: 'b7', version: manifest().version, downloaded: '', checksum: SUM, status: 'pending' as const }]) })
    await expect(checkForUpdate(d)).resolves.toBe('queued')
    expect(d.download).not.toHaveBeenCalled()
    expect(d.next).toHaveBeenCalledWith('b7')
  })

  it('never retries a version that failed before (rolled back)', async () => {
    const d = deps({ bundles: vi.fn(async () => [{ id: 'b7', version: manifest().version, downloaded: '', checksum: SUM, status: 'error' as const }]) })
    await expect(checkForUpdate(d)).resolves.toBe('failed-before')
    expect(d.download).not.toHaveBeenCalled()
    expect(d.next).not.toHaveBeenCalled()
  })

  it('replaces a download an earlier run left unfinished (the app was killed mid-download)', async () => {
    // Within one run, startUpdates() never starts a second check while one is going, so a "downloading"
    // bundle seen here is left over from before.
    const d = deps({ bundles: vi.fn(async () => [{ id: 'b7', version: manifest().version, downloaded: '', checksum: SUM, status: 'downloading' as const }]) })
    await expect(checkForUpdate(d)).resolves.toBe('queued')
    expect(d.remove).toHaveBeenCalledWith('b7')
    expect(d.download).toHaveBeenCalledTimes(1)
    expect(d.next).toHaveBeenCalledWith('b1')
  })

  it.each(['deleted', 'deleting'] as const)('downloads again over a %s bundle', async (status) => {
    const d = deps({ bundles: vi.fn(async () => [{ id: 'b7', version: manifest().version, downloaded: '', checksum: SUM, status }]) })
    await expect(checkForUpdate(d)).resolves.toBe('queued')
    expect(d.download).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['the manifest fetch fails', { fetchJson: vi.fn(async () => { throw new Error('offline') }) }],
    ['the manifest is bad', { fetchJson: vi.fn(async () => ({ version: 1 })) }],
    ['the download fails (e.g. checksum mismatch)', { download: vi.fn(async () => { throw new Error('checksum') }) }],
  ])('keeps the current bundle when %s', async (_label, over) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const d = deps(over as Partial<UpdaterDeps>)
    await expect(checkForUpdate(d)).resolves.toBe('error')
    expect(d.next).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()
  })
})
