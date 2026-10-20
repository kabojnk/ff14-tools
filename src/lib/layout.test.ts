import { describe, expect, it } from 'vitest'
import { defaultPhoneView } from '@/lib/layout'

describe('defaultPhoneView', () => {
  it.each([
    [0, 'chat'],
    [1, 'chat'],
    [2, 'list'],
    [5, 'list'],
  ] as const)('%i conversation(s) → %s', (count, view) => {
    expect(defaultPhoneView(count)).toBe(view)
  })
})
