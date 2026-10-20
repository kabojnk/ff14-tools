import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@supabase/supabase-js'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))

import { ChatHeader } from '@/components/chat2/ChatHeader'
import { useAuthStore } from '@/stores/authStore'
import { useConversationStore } from '@/stores/conversationStore'
import { usePresenceStore } from '@/stores/presenceStore'
import { useProfileStore } from '@/stores/profileStore'
import { useStatusStore } from '@/stores/statusStore'
import { useTypingStore } from '@/stores/typingStore'
import { useUiStore } from '@/stores/uiStore'
import type { Profile } from '@/types'

const CONV = { id: 'conv-1', title: null, archived: false, created_by: null, created_at: '2026-01-01T00:00:00Z' }

const bea: Profile = {
  id: 'bea',
  nickname: 'Bea',
  avatar_url: null,
  banner_url: null,
  profile_message: null,
  status: 'online',
  custom_status_text: 'back at 9',
  status_id: 'raiding',
  read_receipts: true,
  lock_pin_length: null,
  presence_override: null,
  last_seen_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const dragTheLake = vi.fn(async () => {})

beforeEach(() => {
  dragTheLake.mockClear()
  useAuthStore.setState({ user: { id: 'alice' } as User })
  useConversationStore.setState({
    conversation: CONV,
    memberIds: ['alice', 'bea'],
    activeSpace: 'main',
    latest: { main: null, schist: null },
    readAt: { main: null, schist: null },
    dragTheLake,
  })
  useProfileStore.setState({ profiles: { bea } })
  usePresenceStore.setState({ users: { bea: { presence: 'online', lastSeen: 0 } } })
  useStatusStore.setState({
    definitions: [{ id: 'raiding', label: 'Raiding', color: '#ff66aa', position: 1, legacy_key: null, created_by: null, created_at: '', updated_at: '' }],
  } as never)
  useTypingStore.getState().clear()
  useUiStore.setState({ eepMode: false })
})

function renderHeader(over: { isDesktop?: boolean; onBack?: (() => void) | undefined } = {}) {
  const props = { isDesktop: false, onBack: vi.fn() as (() => void) | undefined, onOpenPanel: vi.fn(), ...over }
  render(<ChatHeader {...props} />)
  return props
}

describe('ChatHeader', () => {
  it("shows the partner's name, presence and status pill", () => {
    renderHeader()
    expect(screen.getByRole('button', { name: 'Bea' })).toBeInTheDocument()
    const sub = screen.getByTestId('presence-line')
    expect(sub).toHaveTextContent('online')
    expect(screen.getByText('Raiding')).toBeInTheDocument()
    expect(document.querySelector('[data-presence="online"]')).not.toBeNull()
  })

  it("applies the partner's manual override, live from the profile store", () => {
    renderHeader()
    act(() => useProfileStore.getState().apply({ id: 'bea', presence_override: 'away' }))
    expect(screen.getByTestId('presence-line')).toHaveTextContent('away')
  })

  it('says when an offline partner was last seen', () => {
    usePresenceStore.setState({ users: {} })
    useProfileStore.setState({ profiles: { bea: { ...bea, last_seen_at: new Date().toISOString() } } })
    renderHeader()
    expect(screen.getByTestId('presence-line')).toHaveTextContent(/^last seen /)
  })

  it('says typing… while the partner types in this space only', () => {
    renderHeader()
    act(() => useTypingStore.getState().noteTyping('schist', { user_id: 'bea', nickname: 'Bea' }))
    expect(screen.getByTestId('presence-line')).toHaveTextContent('online')
    act(() => useTypingStore.getState().noteTyping('main', { user_id: 'bea', nickname: 'Bea' }))
    expect(screen.getByTestId('presence-line')).toHaveTextContent('typing…')
  })

  it('the Eep! button shows the disguise', () => {
    renderHeader()
    fireEvent.click(screen.getByRole('button', { name: 'Eep!' }))
    expect(useUiStore.getState().eepMode).toBe(true)
  })

  it('phones: a back chevron and the tabs under the header, no media button', () => {
    const props = renderHeader()
    fireEvent.click(screen.getByRole('button', { name: 'Back to chats' }))
    expect(props.onBack).toHaveBeenCalled()
    expect(screen.getByRole('tablist')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Media, files & links' })).toBeNull()
  })

  it('desktop: no back chevron, the tabs inline and a media button', () => {
    const props = renderHeader({ isDesktop: true, onBack: undefined })
    expect(screen.queryByRole('button', { name: 'Back to chats' })).toBeNull()
    expect(screen.getByRole('tablist')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Media, files & links' }))
    expect(props.onOpenPanel).toHaveBeenCalledWith('media')
    expect(screen.getByRole('button', { name: 'Eep!' })).toHaveTextContent('Eep!')
  })

  it('the ⋮ menu opens the panel tabs and drags the lake', () => {
    const props = renderHeader()
    const open = (name: string) => {
      fireEvent.click(screen.getByRole('button', { name: 'More' }))
      fireEvent.click(screen.getByRole('menuitem', { name }))
    }
    open('Search messages')
    open('Media, files & links')
    open('Pinned messages')
    expect(props.onOpenPanel.mock.calls).toEqual([['search'], ['media'], ['pins']])
    open('Drag the Lake')
    expect(dragTheLake).toHaveBeenCalledTimes(1)
  })

  it("tapping the name opens the partner's card with the pill and status message", () => {
    renderHeader()
    fireEvent.click(screen.getByRole('button', { name: 'Bea' }))
    const card = screen.getByRole('dialog', { name: 'Bea' })
    expect(within(card).getByText('Raiding')).toBeInTheDocument()
    expect(within(card).getByText('back at 9')).toBeInTheDocument()
    fireEvent.click(within(card).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('tapping the avatar opens the card too', () => {
    renderHeader({ isDesktop: true, onBack: undefined })
    fireEvent.click(screen.getByRole('button', { name: "View Bea's profile" }))
    expect(screen.getByRole('dialog', { name: 'Bea' })).toBeInTheDocument()
  })
})
