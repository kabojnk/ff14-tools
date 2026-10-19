import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createReadScheduler } from '@/lib/readScheduler'

const T1 = '2026-10-19T10:00:01Z'
const T2 = '2026-10-19T10:00:02Z'
const T3 = '2026-10-19T10:00:03Z'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('createReadScheduler', () => {
  it('debounces calls within the delay into one send with the newest timestamp', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    const s = createReadScheduler(send, 500)
    s.schedule('main', T2)
    s.schedule('main', T3)
    s.schedule('main', T1)
    await vi.advanceTimersByTimeAsync(499)
    expect(send).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith('main', T3)
  })

  it('never sends a timestamp older than or equal to one already sent', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    const s = createReadScheduler(send, 500)
    s.schedule('main', T2)
    await vi.advanceTimersByTimeAsync(500)
    s.schedule('main', T1)
    s.schedule('main', T2)
    await vi.advanceTimersByTimeAsync(1000)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('does not resend a timestamp that is still in flight', async () => {
    let resolve!: () => void
    const send = vi.fn(() => new Promise<void>((r) => (resolve = r)))
    const s = createReadScheduler(send, 500)
    s.schedule('main', T2)
    await vi.advanceTimersByTimeAsync(500)
    s.schedule('main', T2)
    await vi.advanceTimersByTimeAsync(500)
    resolve()
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('keeps the two spaces independent', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    const s = createReadScheduler(send, 500)
    s.schedule('main', T3)
    s.schedule('schist', T1)
    await vi.advanceTimersByTimeAsync(500)
    expect(send).toHaveBeenCalledTimes(2)
    expect(send).toHaveBeenCalledWith('main', T3)
    expect(send).toHaveBeenCalledWith('schist', T1)
  })

  it('dispose cancels pending sends and ignores later schedules', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    const s = createReadScheduler(send, 500)
    s.schedule('main', T1)
    s.dispose()
    s.schedule('main', T2)
    await vi.advanceTimersByTimeAsync(1000)
    expect(send).not.toHaveBeenCalled()
  })

  it('a rejected send does not block the next schedule, which retries with the newest timestamp', async () => {
    const send = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined)
    const s = createReadScheduler(send, 500)
    s.schedule('main', T2)
    await vi.advanceTimersByTimeAsync(500)
    expect(send).toHaveBeenCalledTimes(1)
    s.schedule('main', T1)
    await vi.advanceTimersByTimeAsync(500)
    expect(send).toHaveBeenCalledTimes(2)
    expect(send).toHaveBeenLastCalledWith('main', T2)
  })

  it('flush sends pending marks immediately and waits for them', async () => {
    let done = false
    const send = vi.fn(async () => {
      done = true
    })
    const s = createReadScheduler(send, 500)
    s.schedule('main', T1)
    s.schedule('schist', T2)
    await s.flush()
    expect(send).toHaveBeenCalledTimes(2)
    expect(done).toBe(true)
    await vi.advanceTimersByTimeAsync(1000)
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('flush with nothing pending does nothing', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    await createReadScheduler(send).flush()
    expect(send).not.toHaveBeenCalled()
  })
})
