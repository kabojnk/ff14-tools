import { beforeEach, describe, expect, it, vi } from 'vitest'

const { rpc, inFn } = vi.hoisted(() => ({
  rpc: vi.fn(async () => ({ error: null as unknown })),
  inFn: vi.fn(async () => ({ data: [{ message_id: 'm1', user_id: 'bea' }], error: null as unknown })),
}))
vi.mock('@/lib/supabase', () => ({
  supabase: { rpc, from: () => ({ select: () => ({ in: inFn }) }) },
}))

import { useVoicePlayStore, voiceMessageIds } from '@/stores/voicePlays'
import type { Message } from '@/types'

const s = () => useVoicePlayStore.getState()

beforeEach(() => {
  s().reset()
})

describe('voicePlays', () => {
  it('loads plays for a page of memos', async () => {
    await s().loadFor(['m1', 'm2'])
    expect(inFn).toHaveBeenCalledWith('message_id', ['m1', 'm2'])
    expect(s().byMessage).toEqual({ m1: ['bea'] })
  })

  it('skips the query with no memos', async () => {
    await s().loadFor([])
    expect(inFn).not.toHaveBeenCalled()
  })

  it('applies realtime inserts once', () => {
    s().apply({ message_id: 'm1', user_id: 'bea' })
    s().apply({ message_id: 'm1', user_id: 'bea' })
    expect(s().byMessage.m1).toEqual(['bea'])
  })

  it('marks played at once and calls the RPC', async () => {
    await s().markPlayed('m9', 'alice')
    expect(rpc).toHaveBeenCalledWith('mark_voice_played', { p_message: 'm9' })
    expect(s().byMessage.m9).toEqual(['alice'])
    await s().markPlayed('m9', 'alice')
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('undoes the mark when the RPC fails, so the next play tries again', async () => {
    rpc.mockResolvedValueOnce({ error: { message: 'boom' } })
    await s().markPlayed('m9', 'alice')
    expect(s().byMessage.m9 ?? []).toEqual([])
  })

  it('picks the voice memos out of a page', () => {
    const m = (id: string, type: 'audio' | 'image' | null) =>
      ({ id, attachments: type ? [{ url: 'u', type, filename: 'f', size: 1, spoiler: false }] : [] }) as unknown as Message
    expect(voiceMessageIds([m('a', 'audio'), m('b', 'image'), m('c', null)])).toEqual(['a'])
  })
})
