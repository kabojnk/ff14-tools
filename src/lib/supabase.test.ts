import { afterEach, describe, expect, it, vi } from 'vitest'
import { AUTH_FETCH_TIMEOUT_MS, fetchWithAuthTimeout } from '@/lib/supabase'

describe('fetchWithAuthTimeout', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('gives auth requests a time limit', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'))
    vi.stubGlobal('fetch', fetchMock)
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    await fetchWithAuthTimeout('https://x.supabase.co/auth/v1/token?grant_type=refresh_token', { method: 'POST' })
    expect(timeout).toHaveBeenCalledWith(AUTH_FETCH_TIMEOUT_MS)
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST', signal: expect.any(AbortSignal) })
  })

  it('leaves other requests (uploads, queries) and a caller’s own signal alone', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'))
    vi.stubGlobal('fetch', fetchMock)
    await fetchWithAuthTimeout('https://x.supabase.co/functions/v1/upload-media', { method: 'POST' })
    expect(fetchMock.mock.calls[0][1]).toEqual({ method: 'POST' })
    const own = new AbortController().signal
    await fetchWithAuthTimeout('https://x.supabase.co/auth/v1/user', { signal: own })
    expect(fetchMock.mock.calls[1][1].signal).toBe(own)
  })
})
