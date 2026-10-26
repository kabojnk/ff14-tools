import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@supabase/supabase-js'

const { toggle, markPlayed } = vi.hoisted(() => ({
  toggle: vi.fn(async () => true),
  markPlayed: vi.fn(async () => {}),
}))
vi.mock('@/lib/supabase', () => ({ supabase: {} }))

import { VoiceBubble } from '@/components/chat2/VoiceBubble'
import { useAuthStore } from '@/stores/authStore'
import { useConversationStore } from '@/stores/conversationStore'
import { useProfileStore } from '@/stores/profileStore'
import { useVoicePlayerStore } from '@/stores/voicePlayer'
import { useVoicePlayStore } from '@/stores/voicePlays'
import type { Attachment, Message, Profile } from '@/types'

const memo: Attachment = { url: 'https://cdn/v.m4a', type: 'audio', filename: 'voice-1.m4a', size: 1, spoiler: false, duration_ms: 19_000, peaks: [10, 50, 90] }
const msg = (author: string, extra: Partial<Message> = {}): Message => ({
  id: 'v1', conversation_id: 'c1', space: 'main', channel_id: null, session_id: 's1', author_id: author,
  content: null, attachments: [memo], type: 'text', edited_at: null, deleted: false, reply_to: null,
  created_at: '2026-10-26T10:00:00Z', ...extra,
})
const profile = (id: string, read_receipts = true) => ({ id, nickname: id, read_receipts }) as unknown as Profile

beforeEach(() => {
  useAuthStore.setState({ user: { id: 'alice' } as User })
  useConversationStore.setState({ memberIds: ['alice', 'bea'] })
  useProfileStore.setState({ profiles: { alice: profile('alice'), bea: profile('bea') } })
  useVoicePlayStore.setState({ byMessage: {}, markPlayed })
  useVoicePlayerStore.setState({ current: null, status: null, position: 0, failed: {}, toggle, stop: vi.fn() })
})

describe('VoiceBubble', () => {
  it('theirs: the duration and an unplayed dot; playing marks it played', async () => {
    render(<VoiceBubble message={msg('bea')} attachment={memo} mine={false} meta={<span>10:00</span>} />)
    expect(screen.getByText('0:19')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Not played yet' })).toBeInTheDocument()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Play voice message' })))
    expect(toggle).toHaveBeenCalledWith('v1', 'https://cdn/v.m4a')
    expect(markPlayed).toHaveBeenCalledWith('v1', 'alice')
  })

  it('theirs, already played by me: no dot', () => {
    useVoicePlayStore.setState({ byMessage: { v1: ['alice'] } })
    render(<VoiceBubble message={msg('bea')} attachment={memo} mine={false} meta={null} />)
    expect(screen.queryByRole('img', { name: 'Not played yet' })).toBeNull()
  })

  it('mine: the mic turns "Played" once they played it, only with both receipts on', () => {
    useVoicePlayStore.setState({ byMessage: { v1: ['bea'] } })
    const { rerender } = render(<VoiceBubble message={msg('alice')} attachment={memo} mine meta={null} />)
    expect(screen.getByRole('img', { name: 'Played' })).toBeInTheDocument()
    act(() => useProfileStore.setState({ profiles: { alice: profile('alice'), bea: profile('bea', false) } }))
    rerender(<VoiceBubble message={msg('alice')} attachment={memo} mine meta={null} />)
    expect(screen.queryByRole('img', { name: 'Played' })).toBeNull()
  })

  it('mine: playing doesn\'t mark anything', async () => {
    render(<VoiceBubble message={msg('alice')} attachment={memo} mine meta={null} />)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Play voice message' })))
    expect(markPlayed).not.toHaveBeenCalled()
  })

  it('while playing: Pause and elapsed / total', () => {
    useVoicePlayerStore.setState({ current: 'v1', status: 'playing', position: 7.2 })
    render(<VoiceBubble message={msg('bea')} attachment={memo} mine={false} meta={null} />)
    expect(screen.getByRole('button', { name: 'Pause voice message' })).toBeInTheDocument()
    expect(screen.getByText('0:07 / 0:19')).toBeInTheDocument()
  })

  it("a failed memo says Can't play", () => {
    useVoicePlayerStore.setState({ current: 'v1', status: 'error', failed: { v1: true } })
    render(<VoiceBubble message={msg('bea')} attachment={memo} mine={false} meta={null} />)
    expect(screen.getByText("Can't play")).toBeInTheDocument()
  })

  it('stops the player when it goes away', () => {
    const stop = vi.fn()
    useVoicePlayerStore.setState({ stop })
    const { unmount } = render(<VoiceBubble message={msg('bea')} attachment={memo} mine={false} meta={null} />)
    unmount()
    expect(stop).toHaveBeenCalledWith('v1')
  })
})
