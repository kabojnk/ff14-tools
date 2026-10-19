import { describe, expect, it } from 'vitest'
import { tickState } from '@/lib/chat/ticks'

const created_at = '2026-10-19T12:00:00Z'

describe('tickState', () => {
  it('is sent when the partner has not read that far', () => {
    expect(tickState({ created_at }, '2026-10-19T11:59:59Z')).toBe('sent')
  })

  it('is read when the partner read at or after the message', () => {
    expect(tickState({ created_at }, created_at)).toBe('read')
    expect(tickState({ created_at }, '2026-10-19T12:00:01Z')).toBe('read')
  })

  it('compares parsed times, not strings', () => {
    // An offset form that sorts lower as a string but is later in time
    expect(tickState({ created_at }, '2026-10-19T08:00:00.123-04:00')).toBe('read')
    expect(tickState({ created_at: '2026-10-19T12:00:00.000+00:00' }, '2026-10-19T12:00:00Z')).toBe('read')
  })

  it('stays sent when receipts are off (no partner read position)', () => {
    expect(tickState({ created_at }, null)).toBe('sent')
  })

  it('stays sent when a timestamp cannot be parsed', () => {
    expect(tickState({ created_at }, 'garbage')).toBe('sent')
  })

  it('lets the local state win', () => {
    expect(tickState({ created_at, localState: 'sending' }, '2026-10-20T00:00:00Z')).toBe('sending')
    expect(tickState({ created_at, localState: 'failed' }, '2026-10-20T00:00:00Z')).toBe('failed')
    expect(tickState({ created_at, localState: 'failed' }, null)).toBe('failed')
  })
})
