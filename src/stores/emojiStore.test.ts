import { beforeEach, describe, expect, it, vi } from 'vitest'

const { select } = vi.hoisted(() => ({ select: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { from: () => ({ select }) } }))

import { useEmojiStore } from '@/stores/emojiStore'

beforeEach(() => {
  useEmojiStore.getState().reset()
  select.mockReset()
})

describe('emojiStore', () => {
  it('loads custom emoji once and looks them up by name', async () => {
    select.mockResolvedValue({ data: [{ name: 'blob', image_url: 'https://cdn/blob.png' }], error: null })
    const before = useEmojiStore.getState().lookup
    await Promise.all([useEmojiStore.getState().load(), useEmojiStore.getState().load()])
    await useEmojiStore.getState().load()
    expect(select).toHaveBeenCalledTimes(1)
    const { lookup } = useEmojiStore.getState()
    expect(lookup).not.toBe(before)
    expect(lookup('blob')).toBe('https://cdn/blob.png')
    expect(lookup('nope')).toBeUndefined()
  })

  it('stays unloaded on an error, so a later call tries again', async () => {
    select.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    await useEmojiStore.getState().load()
    expect(useEmojiStore.getState().loaded).toBe(false)
    select.mockResolvedValueOnce({ data: [], error: null })
    await useEmojiStore.getState().load()
    expect(useEmojiStore.getState().loaded).toBe(true)
  })
})
