import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), auth: { signOut: vi.fn() } } }))

// Stand-ins for the two sheets: MeRow only decides which one is open.
vi.mock('@/components/user/ProfileEditor', () => ({
  ProfileEditor: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="Profile">
      <button type="button" onClick={onClose}>
        Cancel
      </button>
    </div>
  ),
}))
vi.mock('@/components/settings/Settings', () => ({
  Settings: ({ onClose, onEditProfile }: { onClose: () => void; onEditProfile: () => void }) => (
    <div role="dialog" aria-label="Settings">
      <button type="button" onClick={onEditProfile}>
        Edit profile
      </button>
      <button type="button" onClick={onClose}>
        Done
      </button>
    </div>
  ),
}))

import { MeRow } from '@/components/layout/MeRow'
import { useAuthStore } from '@/stores/authStore'
import { usePresenceStore } from '@/stores/presenceStore'
import { useStatusStore } from '@/stores/statusStore'
import type { Profile, StatusDefinition } from '@/types'

const raiding: StatusDefinition = {
  id: 'raiding',
  label: 'Raiding',
  color: '#ec4899',
  position: 1,
  legacy_key: null,
  created_by: null,
  created_at: '2026-10-20T00:00:00Z',
  updated_at: '2026-10-20T00:00:00Z',
}

function signIn(over: Partial<Profile> = {}) {
  useAuthStore.setState({
    profile: { id: 'alice', nickname: 'Alice', avatar_url: null, status_id: null, custom_status_text: null, ...over } as Profile,
  })
}

beforeEach(() => {
  useStatusStore.setState({ definitions: [raiding] })
  usePresenceStore.setState({ users: {}, override: null })
  signIn()
})

describe('MeRow', () => {
  it('shows the presence word when there is no custom status or message', () => {
    render(<MeRow />)
    const row = document.querySelector('[data-me-row]') as HTMLElement
    expect(row).toHaveTextContent('Alice')
    expect(row.querySelector('[data-status-pill]')).toBeNull()
    expect(row.querySelector('[data-presence]')).not.toBeNull()
    expect(within(row).getByText(/^(online|away|offline)$/)).toBeInTheDocument()
  })

  it('shows pill A and then the status message', () => {
    signIn({ status_id: 'raiding', custom_status_text: 'back at 9' })
    render(<MeRow />)
    const row = document.querySelector('[data-me-row]') as HTMLElement
    const pill = row.querySelector('[data-status-pill]') as HTMLElement
    expect(pill.querySelector('[data-status-label]')).toHaveTextContent('Raiding')
    expect(pill.querySelector('[data-pill-dot]')).toHaveStyle({ backgroundColor: '#ec4899' })
    expect(within(row).getByText('back at 9')).toBeInTheDocument()
    expect(within(row).queryByText(/^(online|away|offline)$/)).toBeNull()
  })

  it('shows the message alone when the status was deleted', () => {
    signIn({ status_id: 'gone', custom_status_text: 'back at 9' })
    render(<MeRow />)
    const row = document.querySelector('[data-me-row]') as HTMLElement
    expect(row.querySelector('[data-status-pill]')).toBeNull()
    expect(within(row).getByText('back at 9')).toBeInTheDocument()
  })

  it('opens the profile editor from the avatar', async () => {
    render(<MeRow />)
    await userEvent.click(screen.getByTitle('Set status'))
    expect(screen.getByRole('dialog', { name: 'Profile' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog', { name: 'Profile' })).toBeNull()
  })

  it('opens Settings from the gear, and "Edit profile" swaps it for the editor with focus on the gear', async () => {
    render(<MeRow />)
    const gear = screen.getByRole('button', { name: 'User settings' })
    await userEvent.click(gear)
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Edit profile' }))
    expect(screen.queryByRole('dialog', { name: 'Settings' })).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Profile' })).toBeInTheDocument()
    expect(gear).toHaveFocus()
  })

  it('updates the pill live when the status changes', () => {
    render(<MeRow />)
    act(() => signIn({ status_id: 'raiding' }))
    expect(document.querySelector('[data-me-row] [data-status-label]')).toHaveTextContent('Raiding')
  })
})
