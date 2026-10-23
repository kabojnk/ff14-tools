import { describe, expect, it } from 'vitest'
import { bundleVersion, manifestFor, sha256 } from './native-bundle.mjs'

describe('native-bundle', () => {
  it('stamps the version with the UTC time to the second', () => {
    expect(bundleVersion('0.1.0', new Date('2026-10-20T15:30:12.345Z'))).toBe('0.1.0-20261020153012')
  })

  it('writes a manifest with the zip relative to it', () => {
    expect(manifestFor({ version: '0.1.0-20261020153012', zipName: 'bundle-0.1.0-20261020153012.zip', checksum: 'ab', minNative: '1.0.0' })).toEqual({
      version: '0.1.0-20261020153012',
      url: 'bundle-0.1.0-20261020153012.zip',
      checksum: 'ab',
      minNative: '1.0.0',
    })
  })

  it('hashes with sha256 (hex)', () => {
    expect(sha256(Buffer.from('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})
