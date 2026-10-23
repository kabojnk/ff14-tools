import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('build-time defines', () => {
  it('exposes the package version', () => {
    const pkg = JSON.parse(readFileSync('./package.json', 'utf8')) as { version: string }
    expect(__APP_VERSION__).toBe(pkg.version)
  })

  it('exposes the build date as YYYY-MM-DD', () => {
    expect(__BUILD_DATE__).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
