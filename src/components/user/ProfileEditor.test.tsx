import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockUpdate, mockEq, mockUpload, mockFetchProfile, mockSetOverride } = vi.hoisted(() => ({
  mockUpdate: vi.fn(),
  mockEq: vi.fn(),
  mockUpload: vi.fn(),
  mockFetchProfile: vi.fn(),
  mockSetOverride: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      update: (values: unknown) => {
        mockUpdate(table, values)
        return { eq: mockEq }
      },
    }),
  },
}))

vi.mock('@/lib/bunny', () => ({ uploadFile: mockUpload }))

vi.mock('@/stores/authStore', async () => {
  const { create } = await import('zustand')
  return { useAuthStore: create(() => ({ profile: null as unknown, fetchProfile: mockFetchProfile })) }
})

vi.mock('@/stores/presenceStore', async () => {
  const { create } = await import('zustand')
  return { usePresenceStore: create(() => ({ override: null as unknown, setOverride: mockSetOverride })) }
})

// The crop has its own tests; here it hands back a cropped file straight away.
vi.mock('@/components/ui/ImageCrop', () => ({
  ImageCrop: (p: { title?: string; aspect: number; output: { width: number; height: number }; onDone: (f: File) => void; onCancel: () => void }) => (
    <div data-testid="crop" data-aspect={p.aspect} data-output={`${p.output.width}x${p.output.height}`}>
      <button onClick={() => p.onDone(new File(['x'], p.aspect === 4 ? 'banner.jpg' : 'avatar.jpg', { type: 'image/jpeg' }))}>
        Crop done
      </button>
      <button onClick={p.onCancel}>Crop cancel</button>
    </div>
  ),
}))

import { ProfileEditor } from './ProfileEditor'
import { EXIT_MS, SPRING_MS } from '@/hooks/useSwipeBack'
import { drag, path } from '@/test/touch'
import { useAuthStore } from '@/stores/authStore'
import { usePresenceStore } from '@/stores/presenceStore'
import { useStatusStore } from '@/stores/statusStore'
import type { Profile, StatusDefinition } from '@/types'

const PROFILE = {
  id: 'me',
  nickname: 'Kev',
  avatar_url: 'https://cdn/avatar.jpg',
  banner_url: null,
  profile_message: 'hi',
  status: 'online',
  custom_status_text: 'raiding until 10',
  status_id: 's1',
  presence_override: null,
} as unknown as Profile

const def = (id: string, label: string, color: string, position: number) =>
  ({ id, label, color, position, created_at: '2026-10-01T00:00:00Z' }) as StatusDefinition

const create = vi.fn()

function setup(profile: Partial<Profile> = {}) {
  useAuthStore.setState({ profile: { ...PROFILE, ...profile } } as never)
  const onClose = vi.fn()
  const user = userEvent.setup()
  const utils = render(<ProfileEditor onClose={onClose} />)
  const save = () => screen.getByRole('button', { name: 'Save' })
  const fileInput = (name: 'banner' | 'avatar') => utils.container.ownerDocument.querySelector<HTMLInputElement>(`input[name="${name}"]`)!
  return { ...utils, onClose, user, save, fileInput }
}

const pickFile = (input: HTMLInputElement) =>
  fireEvent.change(input, { target: { files: [new File(['raw'], 'photo.png', { type: 'image/png' })] } })

beforeEach(() => {
  mockUpdate.mockReset()
  mockEq.mockReset().mockResolvedValue({ error: null })
  mockUpload.mockReset().mockImplementation(async (_f: File, path: string) => ({ url: `https://cdn/${path}/new.jpg` }))
  mockFetchProfile.mockReset().mockResolvedValue(undefined)
  mockSetOverride.mockReset().mockResolvedValue(undefined)
  create.mockReset().mockImplementation(async (input: { label: string; color: string }) => {
    const definition = def('created', input.label, input.color, 5)
    useStatusStore.setState((s) => ({ definitions: [...s.definitions, definition] }))
    return { error: null, definition }
  })
  usePresenceStore.setState({ override: null } as never)
  useStatusStore.setState({
    definitions: [def('s1', 'Potential Eep', '#14b8a6', 0), def('s2', 'Found Out', '#a855f7', 1)],
    create,
  } as never)
  // jsdom has no object URLs.
  URL.createObjectURL = vi.fn(() => 'blob:preview')
  URL.revokeObjectURL = vi.fn()
})

describe('ProfileEditor', () => {
  it('opens as the "Profile" sheet with the current values', () => {
    setup()
    expect(screen.getByRole('dialog', { name: 'Profile' })).toBeInTheDocument()
    expect(screen.getByLabelText('Nickname')).toHaveValue('Kev')
    expect(screen.getByLabelText('Status message')).toHaveValue('raiding until 10')
    expect(screen.getByLabelText('About')).toHaveValue('hi')
    expect(screen.getByRole('radio', { name: 'Online' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Potential Eep' })).toHaveAttribute('aria-checked', 'true')
  })

  it('starts "Show me as" from the live override', () => {
    usePresenceStore.setState({ override: 'invisible' } as never)
    setup()
    expect(screen.getByRole('radio', { name: 'Invisible' })).toHaveAttribute('aria-checked', 'true')
  })

  it('Save writes the expected columns, sets the override, refreshes the profile and closes', async () => {
    const { user, save, onClose } = setup()
    await user.clear(screen.getByLabelText('Nickname'))
    await user.type(screen.getByLabelText('Nickname'), '  Kevin ')
    await user.clear(screen.getByLabelText('Status message'))
    await user.type(screen.getByLabelText('Status message'), 'afk')
    await user.clear(screen.getByLabelText('About'))
    await user.click(screen.getByRole('radio', { name: 'Away' }))
    await user.click(screen.getByRole('radio', { name: 'Found Out' }))
    await user.click(save())

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(mockUpdate).toHaveBeenCalledTimes(1)
    expect(mockUpdate).toHaveBeenCalledWith('profiles', {
      nickname: 'Kevin',
      custom_status_text: 'afk',
      profile_message: null,
      status_id: 's2',
      presence_override: 'away',
      status: 'away',
    })
    expect(mockEq).toHaveBeenCalledWith('id', 'me')
    expect(mockUpload).not.toHaveBeenCalled()
    expect(mockSetOverride).toHaveBeenCalledWith('away')
    expect(mockFetchProfile).toHaveBeenCalled()
  })

  it('Invisible writes presence_override "invisible" and status "offline"', async () => {
    const { user, save, onClose } = setup()
    await user.click(screen.getByRole('radio', { name: 'Invisible' }))
    await user.click(save())
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(mockUpdate.mock.calls[0][1]).toMatchObject({ presence_override: 'invisible', status: 'offline' })
    expect(mockSetOverride).toHaveBeenCalledWith('invisible')
  })

  it('Online clears the override', async () => {
    usePresenceStore.setState({ override: 'away' } as never)
    const { user, save, onClose } = setup()
    await user.click(screen.getByRole('radio', { name: 'Online' }))
    await user.click(save())
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(mockUpdate.mock.calls[0][1]).toMatchObject({ presence_override: null, status: 'online' })
  })

  it('writes a null status_id when the chosen status no longer exists', async () => {
    const { user, save, onClose } = setup({ status_id: 'gone' })
    await user.click(save())
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(mockUpdate.mock.calls[0][1]).toMatchObject({ status_id: null })
  })

  it('a blank nickname disables Save with the hint "Enter a nickname"', async () => {
    const { user, save } = setup()
    await user.clear(screen.getByLabelText('Nickname'))
    expect(save()).toBeDisabled()
    expect(screen.getByText('Enter a nickname')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Nickname'), '   ')
    expect(save()).toBeDisabled()
  })

  it('a failed update shows the error, keeps the sheet open and re-enables Save', async () => {
    mockEq.mockResolvedValueOnce({ error: { message: 'network' } })
    const { user, save, onClose } = setup()
    await user.click(save())
    expect(await screen.findByText("Couldn't save. Check your connection and try again.")).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    expect(save()).toBeEnabled()
    expect(mockSetOverride).not.toHaveBeenCalled()
  })

  it('reads "Saving…" and is disabled while saving', async () => {
    let finish!: (v: { error: null }) => void
    mockEq.mockReturnValueOnce(new Promise((r) => { finish = r }))
    const { user, onClose } = setup()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    finish({ error: null })
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('still closes when refreshing the profile or the override fails after a successful update', async () => {
    mockFetchProfile.mockRejectedValueOnce(new Error('offline'))
    mockSetOverride.mockRejectedValueOnce(new Error('offline'))
    const { user, save, onClose } = setup()
    await user.click(save())
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  describe('pictures', () => {
    it('crops a new banner at 4:1 and 960×240, then uploads it to banners/<uid> on Save', async () => {
      const { user, save, onClose, fileInput } = setup()
      await user.click(screen.getByRole('button', { name: 'Change banner' }))
      pickFile(fileInput('banner'))
      const crop = await screen.findByTestId('crop')
      expect(crop).toHaveAttribute('data-aspect', '4')
      expect(crop).toHaveAttribute('data-output', '960x240')
      await user.click(screen.getByRole('button', { name: 'Crop done' }))
      expect(screen.queryByTestId('crop')).not.toBeInTheDocument()
      expect(mockUpload).not.toHaveBeenCalled()

      await user.click(save())
      await waitFor(() => expect(onClose).toHaveBeenCalled())
      expect(mockUpload).toHaveBeenCalledWith(expect.any(File), 'banners/me')
      expect(mockUpdate.mock.calls[0][1]).toMatchObject({ banner_url: 'https://cdn/banners/me/new.jpg' })
      expect(mockUpdate.mock.calls[0][1]).not.toHaveProperty('avatar_url')
    })

    it('crops a new picture at 1:1 and 512×512, then uploads it to avatars/<uid> on Save', async () => {
      const { user, save, onClose, fileInput } = setup()
      expect(screen.getByRole('button', { name: 'Change picture' })).toBeInTheDocument()
      pickFile(fileInput('avatar'))
      const crop = await screen.findByTestId('crop')
      expect(crop).toHaveAttribute('data-aspect', '1')
      expect(crop).toHaveAttribute('data-output', '512x512')
      await user.click(screen.getByRole('button', { name: 'Crop done' }))
      await user.click(save())
      await waitFor(() => expect(onClose).toHaveBeenCalled())
      expect(mockUpload).toHaveBeenCalledWith(expect.any(File), 'avatars/me')
      expect(mockUpdate.mock.calls[0][1]).toMatchObject({ avatar_url: 'https://cdn/avatars/me/new.jpg' })
    })

    it('cancelling the crop stages nothing', async () => {
      const { user, save, onClose, fileInput } = setup()
      pickFile(fileInput('avatar'))
      await user.click(await screen.findByRole('button', { name: 'Crop cancel' }))
      await user.click(save())
      await waitFor(() => expect(onClose).toHaveBeenCalled())
      expect(mockUpload).not.toHaveBeenCalled()
    })

    it('"Remove banner" stages null, and Save writes it', async () => {
      const { user, save, onClose } = setup({ banner_url: 'https://cdn/banner.jpg' })
      await user.click(screen.getByRole('button', { name: 'Remove banner' }))
      expect(screen.queryByRole('button', { name: 'Remove banner' })).not.toBeInTheDocument()
      await user.click(save())
      await waitFor(() => expect(onClose).toHaveBeenCalled())
      expect(mockUpdate.mock.calls[0][1]).toMatchObject({ banner_url: null })
    })

    it('has no "Remove banner" without a banner', () => {
      setup({ banner_url: null })
      expect(screen.queryByRole('button', { name: 'Remove banner' })).not.toBeInTheDocument()
    })

    it('an upload failure shows the error and keeps the sheet open', async () => {
      mockUpload.mockRejectedValueOnce(new Error('upload failed'))
      const { user, save, onClose, fileInput } = setup()
      pickFile(fileInput('avatar'))
      await user.click(await screen.findByRole('button', { name: 'Crop done' }))
      await user.click(save())
      expect(await screen.findByText("Couldn't save. Check your connection and try again.")).toBeInTheDocument()
      expect(onClose).not.toHaveBeenCalled()
      expect(mockUpdate).not.toHaveBeenCalled()
    })

    it('a retry after a failed update reuses the uploaded URLs', async () => {
      mockEq.mockResolvedValueOnce({ error: { message: 'network' } })
      const { user, save, onClose, fileInput } = setup()
      pickFile(fileInput('avatar'))
      await user.click(await screen.findByRole('button', { name: 'Crop done' }))
      await user.click(save())
      await screen.findByText("Couldn't save. Check your connection and try again.")
      await user.click(save())
      await waitFor(() => expect(onClose).toHaveBeenCalled())
      expect(mockUpload).toHaveBeenCalledTimes(1)
      expect(mockUpdate).toHaveBeenCalledTimes(2)
      expect(mockUpdate.mock.calls[1][1]).toMatchObject({ avatar_url: 'https://cdn/avatars/me/new.jpg' })
    })
  })

  describe('an inline status edit open at Save', () => {
    it('is saved first when valid, and the new status is written', async () => {
      const { user, save, onClose } = setup()
      await user.click(screen.getByRole('button', { name: /New status/ }))
      await user.type(screen.getByLabelText('Status label'), 'Busy')
      await user.click(save())
      await waitFor(() => expect(onClose).toHaveBeenCalled())
      expect(create).toHaveBeenCalledWith({ label: 'Busy', color: '#ef4444' })
      expect(mockUpdate.mock.calls[0][1]).toMatchObject({ status_id: 'created' })
    })

    it('blocks Save with the row error when invalid', async () => {
      const { user, save, onClose } = setup()
      await user.click(screen.getByRole('button', { name: /New status/ }))
      await user.click(save())
      expect(await screen.findByRole('alert')).toHaveTextContent('The label must be 1–40 characters.')
      expect(mockUpdate).not.toHaveBeenCalled()
      expect(onClose).not.toHaveBeenCalled()
    })
  })

  describe('Cancel', () => {
    it('closes and writes nothing when nothing changed', async () => {
      const { user, onClose } = setup()
      await user.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(onClose).toHaveBeenCalled()
      expect(mockUpdate).not.toHaveBeenCalled()
      expect(mockUpload).not.toHaveBeenCalled()
      expect(mockSetOverride).not.toHaveBeenCalled()
    })

    it('with changes asks "Discard your changes?" inside the sheet', async () => {
      const { user, onClose } = setup()
      await user.type(screen.getByLabelText('Status message'), '!')
      await user.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(onClose).not.toHaveBeenCalled()
      expect(screen.getByText('Discard your changes?')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Keep editing' }))
      expect(screen.queryByText('Discard your changes?')).not.toBeInTheDocument()
      expect(screen.getByLabelText('Status message')).toHaveValue('raiding until 10!')

      await user.click(screen.getByRole('button', { name: 'Cancel' }))
      await user.click(screen.getByRole('button', { name: 'Discard' }))
      expect(onClose).toHaveBeenCalled()
      expect(mockUpdate).not.toHaveBeenCalled()
    })

    it('Escape with changes asks too', async () => {
      const { user, onClose } = setup()
      await user.click(screen.getByRole('radio', { name: 'Away' }))
      fireEvent.keyDown(document.body, { key: 'Escape' })
      expect(onClose).not.toHaveBeenCalled()
      expect(screen.getByText('Discard your changes?')).toBeInTheDocument()
    })
  })
  // Phones (jsdom has no matchMedia, so the sheet is in its phone layout). A pull down is Cancel.
  describe('Swipe down', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    const panel = () => screen.getByRole('dialog', { name: 'Profile' })
    const pullDown = (from: Element) => drag(from, path([200, 60], [205, 500]))

    it('from the header, with nothing changed: the sheet slides down and closes', () => {
      const { onClose } = setup()
      pullDown(screen.getByRole('heading', { name: 'Profile' }))
      expect(panel().style.transform).toMatch(/^translate3d\(0,\d+px,0\)$/)
      expect(onClose).not.toHaveBeenCalled()
      act(() => vi.advanceTimersByTime(EXIT_MS))
      expect(onClose).toHaveBeenCalledTimes(1)
      expect(mockUpdate).not.toHaveBeenCalled()
    })

    it('from the content while it is scrolled to the top: closes too', () => {
      const { onClose } = setup()
      pullDown(screen.getByText('Show me as'))
      act(() => vi.advanceTimersByTime(EXIT_MS))
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('with changes: springs back and asks "Discard your changes?", like Cancel', () => {
      const { onClose } = setup()
      fireEvent.change(screen.getByLabelText('Status message'), { target: { value: 'afk' } })
      pullDown(screen.getByRole('heading', { name: 'Profile' }))
      expect(panel().style.transform).toBe('')
      expect(screen.getByText('Discard your changes?')).toBeInTheDocument()
      act(() => vi.advanceTimersByTime(SPRING_MS + EXIT_MS))
      expect(onClose).not.toHaveBeenCalled()
      expect(screen.getByLabelText('Status message')).toHaveValue('afk')
    })

    it('a short pull springs back and keeps the sheet open', () => {
      const { onClose } = setup()
      drag(screen.getByRole('heading', { name: 'Profile' }), path([200, 60], [200, 160]))
      act(() => vi.advanceTimersByTime(1000))
      expect(onClose).not.toHaveBeenCalled()
      expect(panel().style.transform).toBe('')
    })

    it('never from a text field, nor from content scrolled down', () => {
      const { onClose } = setup()
      pullDown(screen.getByLabelText('About'))
      const content = panel().querySelector('.overflow-y-auto')!
      content.scrollTop = 120
      pullDown(screen.getByText('Show me as'))
      act(() => vi.advanceTimersByTime(1000))
      expect(onClose).not.toHaveBeenCalled()
    })
  })
})
