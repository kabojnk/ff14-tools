import { beforeEach, describe, expect, it } from 'vitest'
import { useComposerStore } from '@/stores/composerStore'
import type { Message } from '@/types'

const message = (id: string, content: string | null = id): Message => ({
  id,
  conversation_id: 'c',
  space: 'main',
  channel_id: null,
  session_id: 's',
  author_id: 'me',
  content,
  attachments: [],
  type: 'text',
  edited_at: null,
  deleted: false,
  reply_to: null,
  created_at: '2026-10-19T10:00:00Z',
})

beforeEach(() => useComposerStore.setState({ editing: null }))

describe('composerStore', () => {
  it('starts with nothing being edited', () => {
    expect(useComposerStore.getState().editing).toBeNull()
  })

  it('startEdit remembers the message being edited; another startEdit replaces it', () => {
    useComposerStore.getState().startEdit(message('a'))
    expect(useComposerStore.getState().editing?.id).toBe('a')
    useComposerStore.getState().startEdit(message('b'))
    expect(useComposerStore.getState().editing?.id).toBe('b')
  })

  it('cancelEdit clears it', () => {
    useComposerStore.getState().startEdit(message('a'))
    useComposerStore.getState().cancelEdit()
    expect(useComposerStore.getState().editing).toBeNull()
  })
})
