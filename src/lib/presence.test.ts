import { afterEach, describe, expect, it, vi } from 'vitest'
import { aggregate, deviceId, displayed, lastSeen, overrideFor, presenceLine } from '@/lib/presence'

describe('aggregate', () => {
  it('shows a user online when one of two devices is offline', () => {
    const agg = aggregate([
      { user_id: 'bea', device_id: 'phone', presence: 'offline', at: 100 },
      { user_id: 'bea', device_id: 'laptop', presence: 'online', at: 50 },
    ])
    expect(agg.bea.presence).toBe('online')
  })

  it('shows offline when every device is offline, with lastSeen the latest', () => {
    const agg = aggregate([
      { user_id: 'bea', device_id: 'phone', presence: 'offline', at: 100 },
      { user_id: 'bea', device_id: 'laptop', presence: 'offline', at: 300 },
      { user_id: 'bea', device_id: 'tablet', presence: 'offline', at: 200 },
    ])
    expect(agg.bea).toEqual({ presence: 'offline', lastSeen: 300 })
  })

  it('ranks away between online and offline', () => {
    const agg = aggregate([
      { user_id: 'bea', device_id: 'a', presence: 'offline', at: 1 },
      { user_id: 'bea', device_id: 'b', presence: 'away', at: 1 },
    ])
    expect(agg.bea.presence).toBe('away')
  })

  it('counts every entry, including two tabs sharing a device id', () => {
    const agg = aggregate([
      { user_id: 'bea', device_id: 'same', presence: 'online', at: 1 },
      { user_id: 'bea', device_id: 'same', presence: 'offline', at: 2 },
    ])
    expect(agg.bea).toEqual({ presence: 'online', lastSeen: 2 })
  })

  it('keeps users apart', () => {
    const agg = aggregate([
      { user_id: 'bea', device_id: 'a', presence: 'online', at: 1 },
      { user_id: 'cleo', device_id: 'b', presence: 'offline', at: 1 },
    ])
    expect(agg.bea.presence).toBe('online')
    expect(agg.cleo.presence).toBe('offline')
  })

  it('maps a legacy payload (status only, no presence) through presenceOf', () => {
    const agg = aggregate([
      { user_id: 'bea', status: 'found_out' },
      { user_id: 'cleo', status: 'away' },
      { user_id: 'dan', status: 'offline' },
    ])
    expect(agg.bea).toEqual({ presence: 'online', lastSeen: 0 })
    expect(agg.cleo.presence).toBe('away')
    expect(agg.dan.presence).toBe('offline')
  })

  it('prefers presence over the legacy status when both are sent', () => {
    const agg = aggregate([{ user_id: 'bea', device_id: 'a', presence: 'online', status: 'offline', at: 1 }])
    expect(agg.bea.presence).toBe('online')
  })
})

describe('displayed', () => {
  it('uses the aggregate when there is no override', () => {
    expect(displayed({ presence: 'online' }, null)).toBe('online')
    expect(displayed(undefined, null)).toBe('offline')
    expect(displayed({ presence: 'online' }, undefined)).toBe('online')
  })

  it('manual Invisible overrides online', () => {
    expect(displayed({ presence: 'online' }, 'invisible')).toBe('offline')
  })

  it('manual Away overrides online', () => {
    expect(displayed({ presence: 'online' }, 'away')).toBe('away')
  })

  it('Away does not make an offline user look present', () => {
    expect(displayed({ presence: 'offline' }, 'away')).toBe('offline')
    expect(displayed(undefined, 'away')).toBe('offline')
  })
})

describe('overrideFor', () => {
  it('maps the picker choice to profiles.presence_override', () => {
    expect(overrideFor('online')).toBeNull()
    expect(overrideFor('away')).toBe('away')
    expect(overrideFor('offline')).toBe('invisible')
  })
})

describe('lastSeen', () => {
  it('reads profiles.last_seen_at as epoch ms', () => {
    expect(lastSeen({ last_seen_at: '2026-10-19T12:00:00Z' })).toBe(Date.parse('2026-10-19T12:00:00Z'))
  })

  it('is null when unknown', () => {
    expect(lastSeen({ last_seen_at: null })).toBeNull()
    expect(lastSeen({})).toBeNull()
    expect(lastSeen(undefined)).toBeNull()
    expect(lastSeen({ last_seen_at: 'garbage' })).toBeNull()
  })
})

describe('deviceId', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('is stable across calls and stored in localStorage', () => {
    const a = deviceId()
    expect(a).toMatch(/^[0-9a-f-]{36}$/)
    expect(deviceId()).toBe(a)
    expect(localStorage.getItem('deviceId')).toBe(a)
  })

  it('reuses an existing stored id', () => {
    localStorage.setItem('deviceId', 'kept-id')
    expect(deviceId()).toBe('kept-id')
  })

  it('falls back to a per-session id when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const a = deviceId()
    expect(a).toBeTruthy()
    expect(deviceId()).toBe(a)
  })
})

describe('presenceLine', () => {
  const now = new Date(2026, 9, 19, 15, 0)
  const opts = { locale: 'en-US' }

  it('says online or away as they are', () => {
    expect(presenceLine('online', null, now, opts)).toBe('online')
    expect(presenceLine('away', now.getTime(), now, opts)).toBe('away')
  })

  it('says when an offline person was last seen: the time today', () => {
    expect(presenceLine('offline', new Date(2026, 9, 19, 9, 14).getTime(), now, opts)).toBe('last seen 9:14 AM')
  })

  it('says yesterday, the weekday this week, else the date', () => {
    expect(presenceLine('offline', new Date(2026, 9, 18, 23, 0).getTime(), now, opts)).toBe('last seen yesterday')
    expect(presenceLine('offline', new Date(2026, 9, 15, 12, 0).getTime(), now, opts)).toBe('last seen Thu')
    expect(presenceLine('offline', new Date(2026, 8, 3, 12, 0).getTime(), now, opts)).toBe('last seen Sep 3')
  })

  it('says offline when last seen is unknown', () => {
    expect(presenceLine('offline', null, now, opts)).toBe('offline')
  })
})
