import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn(), auth: { signOut: vi.fn() } },
}))

const { mockLogOut } = vi.hoisted(() => ({ mockLogOut: vi.fn() }))
vi.mock('@/lib/logout', () => ({ logOut: mockLogOut }))

// A stand-in PinPad: "Enter" submits a fixed PIN.
vi.mock('@/components/pin/PinPad', () => ({
  PinPad: ({ onSuccess }: { onSuccess: (pin: string) => void | Promise<void> }) => (
    <div data-pin-pad="" data-testid="pin-pad">
      <button type="button" onClick={() => void onSuccess('123456')}>Enter</button>
    </div>
  ),
}))

import { Settings } from '@/components/settings/Settings'
import { useAuthStore } from '@/stores/authStore'
import { useStatusStore } from '@/stores/statusStore'
import { useUiStore } from '@/stores/uiStore'

/** A controllable matchMedia: `setDesktop(true)` flips DESKTOP_QUERY and notifies listeners. */
function stubMatchMedia(initialDesktop: boolean) {
  let desktop = initialDesktop
  const listeners = new Set<() => void>()
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() {
      return query.includes('min-width: 900px') ? desktop : false
    },
    media: query,
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
  }))
  return {
    setDesktop(next: boolean) {
      desktop = next
      act(() => listeners.forEach((cb) => cb()))
    },
  }
}

const esc = () => fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
const setPin = vi.fn()

let media: ReturnType<typeof stubMatchMedia>

beforeEach(() => {
  media = stubMatchMedia(false)
  mockLogOut.mockReset().mockResolvedValue(undefined)
  setPin.mockReset().mockResolvedValue(undefined)
  useUiStore.setState({ theme: 'nord', pinLength: null, setPin })
  useAuthStore.setState({
    profile: { id: 'me', nickname: 'Kev', avatar_url: null, status_id: 's1', read_receipts: true },
  } as never)
  useStatusStore.setState({
    definitions: [{ id: 's1', label: 'Potential Eep', color: '#14b8a6' }],
  } as never)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderSettings() {
  const onClose = vi.fn()
  const onEditProfile = vi.fn()
  const utils = render(<Settings onClose={onClose} onEditProfile={onEditProfile} />)
  return { ...utils, onClose, onEditProfile }
}

describe('Settings on phones', () => {
  it('shows the profile card and one row per section with its value', () => {
    useUiStore.setState({ pinLength: 6 })
    renderSettings()
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument()
    const card = screen.getByRole('button', { name: 'Edit profile' })
    expect(card).toHaveTextContent('Kev')
    expect(card).toHaveTextContent('Potential Eep')
    expect(screen.getByRole('button', { name: 'Appearance' })).toHaveAccessibleDescription('Nord')
    expect(screen.getByRole('button', { name: 'Security & privacy' })).toHaveAccessibleDescription('PIN on')
    expect(screen.getByRole('button', { name: 'Notifications' })).toHaveAccessibleDescription('iPhone app')
    expect(screen.getByRole('button', { name: 'About' })).toHaveAccessibleDescription(__APP_VERSION__)
  })

  it('says "PIN off" without a PIN', () => {
    renderSettings()
    expect(screen.getByRole('button', { name: 'Security & privacy' })).toHaveAccessibleDescription('PIN off')
  })

  it('"Done" closes; "Edit profile" calls onEditProfile', async () => {
    const { onClose, onEditProfile } = renderSettings()
    await userEvent.click(screen.getByRole('button', { name: 'Edit profile' }))
    expect(onEditProfile).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('a row pushes its section (title, Back) and Back pops it', async () => {
    const { onClose } = renderSettings()
    await userEvent.click(screen.getByRole('button', { name: 'Security & privacy' }))
    expect(screen.getByRole('heading', { name: 'Security & privacy' })).toBeInTheDocument()
    expect(screen.getByText('App Lock PIN')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit profile' })).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('Esc in a pushed section goes Back; Esc at the top closes', async () => {
    const { onClose } = renderSettings()
    await userEvent.click(screen.getByRole('button', { name: 'Appearance' }))
    expect(screen.getByRole('radiogroup', { name: 'Theme' })).toBeInTheDocument()
    esc()
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    esc()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Log out in Security & privacy asks first; Cancel keeps you signed in', async () => {
    renderSettings()
    await userEvent.click(screen.getByRole('button', { name: 'Security & privacy' }))
    await userEvent.click(screen.getByRole('button', { name: 'Log out' }))
    const confirm = screen.getByRole('alertdialog', { name: 'Log out of this device?' })
    await userEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(mockLogOut).not.toHaveBeenCalled()
  })

  it('confirming Log out calls logOut()', async () => {
    renderSettings()
    await userEvent.click(screen.getByRole('button', { name: 'Security & privacy' }))
    await userEvent.click(screen.getByRole('button', { name: 'Log out' }))
    const confirm = screen.getByRole('alertdialog', { name: 'Log out of this device?' })
    await userEvent.click(within(confirm).getByRole('button', { name: 'Log out' }))
    expect(mockLogOut).toHaveBeenCalledTimes(1)
  })

  it('Esc with the Log out question open dismisses only the question', async () => {
    const { onClose } = renderSettings()
    await userEvent.click(screen.getByRole('button', { name: 'Security & privacy' }))
    await userEvent.click(screen.getByRole('button', { name: 'Log out' }))
    esc()
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Security & privacy' })).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('Settings on desktop', () => {
  beforeEach(() => {
    media = stubMatchMedia(true)
  })

  it('opens on Appearance with a left nav and a "Close settings" button', async () => {
    const { onClose } = renderSettings()
    const nav = screen.getByRole('navigation', { name: 'Settings sections' })
    expect(within(nav).getByRole('button', { name: 'Appearance' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('heading', { name: 'Appearance' })).toBeInTheDocument()
    expect(screen.getByRole('radiogroup', { name: 'Theme' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Close settings' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('the nav switches sections; Profile calls onEditProfile', async () => {
    const { onEditProfile } = renderSettings()
    const nav = screen.getByRole('navigation', { name: 'Settings sections' })
    await userEvent.click(within(nav).getByRole('button', { name: 'Security & privacy' }))
    expect(within(nav).getByRole('button', { name: 'Security & privacy' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByText('App Lock PIN')).toBeInTheDocument()
    // Log out sits in the nav on desktop, not in the section.
    expect(screen.getAllByRole('button', { name: 'Log out' })).toHaveLength(1)
    await userEvent.click(within(nav).getByRole('button', { name: 'About' }))
    expect(screen.getByText('Version')).toBeInTheDocument()
    await userEvent.click(within(nav).getByRole('button', { name: 'Notifications' }))
    expect(screen.getByText('Notifications come with the iPhone app.')).toBeInTheDocument()
    await userEvent.click(within(nav).getByRole('button', { name: 'Profile' }))
    expect(onEditProfile).toHaveBeenCalledTimes(1)
  })

  it('Log out at the bottom of the nav asks first, then calls logOut()', async () => {
    renderSettings()
    await userEvent.click(screen.getByRole('button', { name: 'Log out' }))
    const confirm = screen.getByRole('alertdialog', { name: 'Log out of this device?' })
    await userEvent.click(within(confirm).getByRole('button', { name: 'Log out' }))
    expect(mockLogOut).toHaveBeenCalledTimes(1)
  })

  it('Esc closes', () => {
    const { onClose } = renderSettings()
    esc()
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('Settings across the breakpoint', () => {
  it('a pushed phone section stays selected on desktop, and back again', async () => {
    renderSettings()
    await userEvent.click(screen.getByRole('button', { name: 'Notifications' }))
    media.setDesktop(true)
    const nav = screen.getByRole('navigation', { name: 'Settings sections' })
    expect(within(nav).getByRole('button', { name: 'Notifications' })).toHaveAttribute('aria-current', 'page')
    await userEvent.click(within(nav).getByRole('button', { name: 'About' }))
    media.setDesktop(false)
    expect(screen.getByRole('heading', { name: 'About' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument()
  })

  it('the phone list becomes desktop Appearance', () => {
    renderSettings()
    media.setDesktop(true)
    const nav = screen.getByRole('navigation', { name: 'Settings sections' })
    expect(within(nav).getByRole('button', { name: 'Appearance' })).toHaveAttribute('aria-current', 'page')
  })

  it('keeps the PIN wizard running and its success message', async () => {
    renderSettings()
    await userEvent.click(screen.getByRole('button', { name: 'Security & privacy' }))
    await userEvent.click(screen.getByRole('button', { name: 'Set PIN' }))
    media.setDesktop(true)
    expect(screen.getByTestId('pin-pad')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Enter' }))
    expect(setPin).toHaveBeenCalledWith('123456')
    expect(await screen.findByText('PIN set successfully')).toBeInTheDocument()
  })
})

describe('Settings closed mid-PIN-wizard', () => {
  it('closes the PinPad and saves nothing', async () => {
    const { unmount } = renderSettings()
    await userEvent.click(screen.getByRole('button', { name: 'Security & privacy' }))
    await userEvent.click(screen.getByRole('button', { name: 'Set PIN' }))
    expect(document.querySelector('[data-pin-pad]')).not.toBeNull()
    unmount()
    expect(document.querySelector('[data-pin-pad]')).toBeNull()
    expect(setPin).not.toHaveBeenCalled()
  })
})
