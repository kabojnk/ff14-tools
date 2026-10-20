import { beforeEach, describe, expect, it, vi } from 'vitest'

type Cb = (...args: unknown[]) => void

const fake = vi.hoisted(() => {
  const state = {
    name: '',
    opts: undefined as unknown,
    syncCb: null as null | (() => void),
    subscribeCb: null as null | ((s: string) => void | Promise<void>),
    serverState: {} as Record<string, unknown[]>,
    track: null as unknown as ReturnType<typeof vi.fn>,
  }
  return state
})

const rpc = vi.hoisted(() => vi.fn(async () => ({ data: null, error: null })))
const removeChannel = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase', () => ({
  supabase: {
    channel: (name: string, opts: unknown) => {
      fake.name = name
      fake.opts = opts
      const ch = {
        on: (_t: string, filter: { event: string }, cb: Cb) => {
          if (filter.event === 'sync') fake.syncCb = cb as () => void
          return ch
        },
        subscribe: (cb: (s: string) => void) => {
          fake.subscribeCb = cb
          return ch
        },
        track: fake.track,
        presenceState: () => fake.serverState,
      }
      return ch
    },
    removeChannel,
    rpc,
  },
}))

import { usePresenceStore } from '@/stores/presenceStore'
import { deviceId } from '@/lib/presence'

const initial = usePresenceStore.getState()
const ME = 'alice'

function lastTrack() {
  const calls = fake.track.mock.calls
  return calls[calls.length - 1]?.[0] as Record<string, unknown>
}

beforeEach(() => {
  usePresenceStore.setState(initial, true)
  fake.track = vi.fn(async () => 'ok')
  fake.syncCb = null
  fake.subscribeCb = null
  fake.serverState = {}
  rpc.mockClear()
  removeChannel.mockClear()
})

describe('presenceStore', () => {
  it('keys presence by user and device, and tracks only once subscribed', async () => {
    usePresenceStore.getState().initPresence(ME, null)
    expect(fake.opts).toEqual({ config: { presence: { key: `${ME}:${deviceId()}` } } })
    expect(fake.track).not.toHaveBeenCalled()
    await fake.subscribeCb!('SUBSCRIBED')
    expect(lastTrack()).toMatchObject({
      user_id: ME,
      device_id: deviceId(),
      presence: 'online',
      status: 'online',
    })
    expect(typeof lastTrack().at).toBe('number')
    expect(lastTrack()).not.toHaveProperty('custom_status_text')
  })

  it('re-tracks the current state (not the initial one) on every SUBSCRIBED', async () => {
    usePresenceStore.getState().initPresence(ME, null)
    await fake.subscribeCb!('SUBSCRIBED')
    await usePresenceStore.getState().setDevicePresence('offline')
    fake.track.mockClear()
    await fake.subscribeCb!('SUBSCRIBED')
    expect(lastTrack()).toMatchObject({ presence: 'offline', status: 'offline' })
  })

  it('sends the override as the legacy status for old apps, keeping presence raw', async () => {
    usePresenceStore.getState().initPresence(ME, 'invisible')
    await fake.subscribeCb!('SUBSCRIBED')
    expect(lastTrack()).toMatchObject({ presence: 'online', status: 'offline' })
    await usePresenceStore.getState().setOverride('away')
    expect(lastTrack()).toMatchObject({ presence: 'online', status: 'away' })
    await usePresenceStore.getState().setOverride(null)
    expect(lastTrack()).toMatchObject({ presence: 'online', status: 'online' })
  })

  it('aggregates every entry on sync: one device hidden still shows online', () => {
    usePresenceStore.getState().initPresence(ME, null)
    fake.serverState = {
      'bea:phone': [{ user_id: 'bea', device_id: 'phone', presence: 'offline', status: 'offline', at: 5 }],
      'bea:laptop': [{ user_id: 'bea', device_id: 'laptop', presence: 'online', status: 'online', at: 3 }],
      cleo: [{ user_id: 'cleo', status: 'away' }],
    }
    fake.syncCb!()
    const s = usePresenceStore.getState()
    expect(s.presenceOf('bea')).toBe('online')
    expect(s.presenceOf('cleo')).toBe('away')
    expect(s.presenceOf('nobody')).toBe('offline')
  })

  it('keeps an optimistic self entry until the server confirms this device', () => {
    usePresenceStore.getState().initPresence(ME, null)
    expect(usePresenceStore.getState().presenceOf(ME)).toBe('online')
    fake.serverState = {}
    fake.syncCb!()
    expect(usePresenceStore.getState().presenceOf(ME)).toBe('online')
  })

  it('hiding this device does not hide my other devices', async () => {
    usePresenceStore.getState().initPresence(ME, null)
    fake.serverState = {
      [`${ME}:other`]: [{ user_id: ME, device_id: 'other', presence: 'online', at: 1 }],
      [`${ME}:${deviceId()}`]: [{ user_id: ME, device_id: deviceId(), presence: 'online', at: 1 }],
    }
    fake.syncCb!()
    await usePresenceStore.getState().setDevicePresence('offline')
    expect(usePresenceStore.getState().presenceOf(ME)).toBe('online')
  })

  it('shows me offline at once when my only device hides', async () => {
    usePresenceStore.getState().initPresence(ME, null)
    await usePresenceStore.getState().setDevicePresence('offline')
    expect(usePresenceStore.getState().presenceOf(ME)).toBe('offline')
  })

  it('touchLastSeen calls the touch_last_seen RPC only while signed in', async () => {
    await usePresenceStore.getState().touchLastSeen()
    expect(rpc).not.toHaveBeenCalled()
    usePresenceStore.getState().initPresence(ME, null)
    await usePresenceStore.getState().touchLastSeen()
    expect(rpc).toHaveBeenCalledWith('touch_last_seen')
  })

  it('cleanup removes the channel and resets state', () => {
    usePresenceStore.getState().initPresence(ME, 'away')
    usePresenceStore.getState().cleanupPresence()
    expect(removeChannel).toHaveBeenCalledTimes(1)
    const s = usePresenceStore.getState()
    expect(s.presenceChannel).toBeNull()
    expect(s.users).toEqual({})
    expect(s.override).toBeNull()
  })
})
