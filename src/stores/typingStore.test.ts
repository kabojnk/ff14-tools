import { beforeEach, describe, expect, it } from 'vitest'
import { TYPING_TIMEOUT_MS, useTypingStore } from '@/stores/typingStore'

const initialState = useTypingStore.getState()

beforeEach(() => {
  useTypingStore.setState(initialState, true)
})

describe('typingStore', () => {
  it('records typing per space and replaces a repeat from the same user', () => {
    const { noteTyping } = useTypingStore.getState()
    noteTyping('main', { user_id: 'bea', nickname: 'Bea' }, 1000)
    noteTyping('main', { user_id: 'bea', nickname: 'Bea' }, 2000)
    noteTyping('schist', { user_id: 'cleo', nickname: 'Cleo' }, 1500)
    const { typing } = useTypingStore.getState()
    expect(typing.main).toEqual([{ user_id: 'bea', nickname: 'Bea', at: 2000 }])
    expect(typing.schist).toEqual([{ user_id: 'cleo', nickname: 'Cleo', at: 1500 }])
  })

  it('prune drops entries older than the timeout', () => {
    const { noteTyping } = useTypingStore.getState()
    noteTyping('main', { user_id: 'bea', nickname: 'Bea' }, 1000)
    noteTyping('main', { user_id: 'cleo', nickname: 'Cleo' }, 3000)
    useTypingStore.getState().prune(1000 + TYPING_TIMEOUT_MS)
    expect(useTypingStore.getState().typing.main.map((t) => t.user_id)).toEqual(['cleo'])
  })

  it('prune keeps the same state object when nothing expired', () => {
    useTypingStore.getState().noteTyping('main', { user_id: 'bea', nickname: 'Bea' }, 1000)
    const before = useTypingStore.getState().typing
    useTypingStore.getState().prune(1001)
    expect(useTypingStore.getState().typing).toBe(before)
  })
})
