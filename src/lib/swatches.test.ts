import { describe, expect, it } from 'vitest'
import { STATUS_SWATCHES, isPresetSwatch } from './swatches'

describe('STATUS_SWATCHES', () => {
  it('holds the 11 mockup colours in order', () => {
    expect(STATUS_SWATCHES).toEqual([
      '#ef4444', '#f97316', '#f5a524', '#22c55e', '#14b8a6', '#3b82f6',
      '#6366f1', '#a855f7', '#ec4899', '#f472b6', '#94a3b8',
    ])
  })

  it('recognises presets case-insensitively', () => {
    expect(isPresetSwatch('#EF4444')).toBe(true)
    expect(isPresetSwatch('#123456')).toBe(false)
    expect(isPresetSwatch(null)).toBe(false)
    expect(isPresetSwatch('')).toBe(false)
  })
})
