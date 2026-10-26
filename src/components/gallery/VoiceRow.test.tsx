import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@supabase/supabase-js'

const { toggle, markPlayed, stop } = vi.hoisted(() => ({ toggle: vi.fn(async () => true), markPlayed: vi.fn(async () => {}), stop: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: {} }))

import { VoiceRow } from '@/components/gallery/VoiceRow'
import { useAuthStore } from '@/stores/authStore'
import { useJumpStore } from '@/stores/jumpStore'
import { useProfileStore } from '@/stores/profileStore'
import { useVoicePlayerStore } from '@/stores/voicePlayer'
import { useVoicePlayStore } from '@/stores/voicePlays'
import type { MediaItem, Profile } from '@/types'

const item = (author: string): MediaItem => ({
  id: 'mm1', message_id: 'v1', conversation_id: 'c1', space: 'main', session_id: 's1', kind: 'audio',
  url: 'https://cdn/v.m4a', filename: 'voice-1.m4a', extension: 'm4a', size: 1, spoiler: false,
  created_at: '2026-10-23T10:00:00Z', duration_ms: 84_000, author_id: author,
})
const now = new Date('2026-10-26T12:00:00Z')

beforeEach(() => {
  useAuthStore.setState({ user: { id: 'alice' } as User })
  useProfileStore.setState({ profiles: { bea: { id: 'bea', nickname: 'Bea' } as Profile } })
  useVoicePlayerStore.setState({ current: null, status: null, position: 0, failed: {}, toggle, stop })
  useVoicePlayStore.setState({ markPlayed })
  useJumpStore.setState({ pending: null })
})

describe('VoiceRow', () => {
  it('shows who and how long, then the space and date', () => {
    render(<VoiceRow item={item('alice')} now={now} dim={false} />)
    expect(screen.getByText('You · 1:24')).toBeInTheDocument()
    expect(screen.getByText(/^Main · /)).toBeInTheDocument()
  })

  it("plays, and marks the other person's memo played", async () => {
    render(<VoiceRow item={item('bea')} now={now} dim={false} />)
    expect(screen.getByText('Bea · 1:24')).toBeInTheDocument()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Play voice message' })))
    expect(toggle).toHaveBeenCalledWith('gallery:v1', 'https://cdn/v.m4a')
    expect(markPlayed).toHaveBeenCalledWith('v1', 'alice')
  })

  it('Show in chat asks for a jump to the message', () => {
    render(<VoiceRow item={item('bea')} now={now} dim={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Show in chat' }))
    expect(useJumpStore.getState().pending).toMatchObject({ messageId: 'v1', space: 'main', created_at: '2026-10-23T10:00:00Z' })
  })

  it('stops only its own playback when it goes away (not the chat bubble\'s)', () => {
    const { unmount } = render(<VoiceRow item={item('bea')} now={now} dim={false} />)
    unmount()
    expect(stop).toHaveBeenCalledWith('gallery:v1')
  })
})
