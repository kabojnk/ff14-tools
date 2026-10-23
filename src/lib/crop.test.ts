import { describe, expect, it } from 'vitest'
import { clampOffset, cropFileName, cropRect } from './crop'

describe('cropRect', () => {
  const natural = { w: 400, h: 200 }
  const frame = { w: 100, h: 100 }

  it('is centred at zoom 1 with no offset, covering the frame', () => {
    expect(cropRect(natural, frame, 1, { x: 0, y: 0 })).toEqual({ sx: 100, sy: 0, sw: 200, sh: 200 })
  })

  it('halves the source size at zoom 2', () => {
    expect(cropRect(natural, frame, 2, { x: 0, y: 0 })).toEqual({ sx: 150, sy: 50, sw: 100, sh: 100 })
  })

  it('clamps at the edges so the image always covers the frame', () => {
    expect(cropRect(natural, frame, 1, { x: 1000, y: 0 })).toEqual({ sx: 0, sy: 0, sw: 200, sh: 200 })
    expect(cropRect(natural, frame, 1, { x: -1000, y: 0 })).toEqual({ sx: 200, sy: 0, sw: 200, sh: 200 })
    // No room to move vertically at zoom 1.
    expect(cropRect(natural, frame, 1, { x: 0, y: 500 })).toEqual({ sx: 100, sy: 0, sw: 200, sh: 200 })
  })

  it('handles a non-square frame', () => {
    // 4:1 frame over a square image: cover by width.
    expect(cropRect({ w: 800, h: 800 }, { w: 400, h: 100 }, 1, { x: 0, y: 0 })).toEqual({ sx: 0, sy: 300, sw: 800, sh: 200 })
  })
})

describe('clampOffset', () => {
  it('limits the offset to half the overflow', () => {
    expect(clampOffset({ w: 400, h: 200 }, { w: 100, h: 100 }, 1, { x: 80, y: -20 })).toEqual({ x: 50, y: 0 })
    expect(clampOffset({ w: 400, h: 200 }, { w: 100, h: 100 }, 2, { x: -80, y: -20 })).toEqual({ x: -80, y: -20 })
  })
})

describe('cropFileName', () => {
  it('names the output by type and shape', () => {
    expect(cropFileName('image/png', 1)).toBe('emoji.png')
    expect(cropFileName('image/jpeg', 4)).toBe('banner.jpg')
    expect(cropFileName('image/jpeg', 1)).toBe('avatar.jpg')
  })
})
