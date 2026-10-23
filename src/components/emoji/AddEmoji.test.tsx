import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => {
  const channel = { on: () => channel, subscribe: () => channel }
  return {
    supabase: {
      from: () => ({ select: () => Promise.resolve({ data: [], error: null }) }),
      channel: () => channel,
      removeChannel: () => {},
    },
  }
})

import { AddEmoji } from '@/components/emoji/AddEmoji'
import { emojiFileError } from '@/lib/emoji/upload'
import { useEmojiStore } from '@/stores/emojiStore'

const MB = 1024 * 1024

/** A file of the given type that reports `size` bytes without allocating them. */
function fakeFile(name: string, type: string, size = 1000): File {
  const f = new File(['x'], name, { type })
  Object.defineProperty(f, 'size', { value: size })
  return f
}

let add: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.stubGlobal('matchMedia', undefined)
  Object.defineProperty(HTMLImageElement.prototype, 'decode', { configurable: true, value: vi.fn().mockResolvedValue(undefined) })
  Object.defineProperty(HTMLImageElement.prototype, 'naturalWidth', { configurable: true, get: () => 400 })
  Object.defineProperty(HTMLImageElement.prototype, 'naturalHeight', { configurable: true, get: () => 300 })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
    imageSmoothingQuality: 'low',
  } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, cb, type) {
    cb(new Blob(['png'], { type: type ?? 'image/png' }))
  })
  URL.createObjectURL = vi.fn(() => 'blob:test')
  URL.revokeObjectURL = vi.fn()
  add = vi.fn().mockResolvedValue({ error: null })
  const byName = { moogle: '/moogle.png' }
  useEmojiStore.setState({ byName, lookup: (n) => byName[n as keyof typeof byName], add })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  delete (HTMLImageElement.prototype as { decode?: unknown }).decode
  delete (HTMLImageElement.prototype as { naturalWidth?: unknown }).naturalWidth
  delete (HTMLImageElement.prototype as { naturalHeight?: unknown }).naturalHeight
})

function setup(file: File | null = null) {
  const onClose = vi.fn()
  const onAdded = vi.fn()
  const utils = render(<AddEmoji file={file} onClose={onClose} onAdded={onAdded} />)
  return { ...utils, onClose, onAdded }
}

/** From the crop step: Next, then wait for the name step. */
async function cropNext() {
  const crop = screen.getByRole('dialog', { name: 'Crop' })
  const next = within(crop).getByRole('button', { name: 'Next' })
  await waitFor(() => expect(next).toBeEnabled())
  fireEvent.click(next)
  await screen.findByRole('dialog', { name: 'Name it' })
}

describe('emojiFileError', () => {
  it('takes still pictures up to 25 MB and GIFs up to 2 MB, and nothing else', () => {
    expect(emojiFileError(fakeFile('a.jpg', 'image/jpeg', 25 * MB))).toBeNull()
    expect(emojiFileError(fakeFile('a.jpg', 'image/jpeg', 25 * MB + 1))).toBe('Pictures can be up to 25 MB.')
    expect(emojiFileError(fakeFile('a.gif', 'image/gif', 2 * MB))).toBeNull()
    expect(emojiFileError(fakeFile('a.gif', 'image/gif', 2 * MB + 1))).toBe('GIFs can be up to 2 MB.')
    expect(emojiFileError(fakeFile('a.webp', 'image/webp'))).toBeNull()
    expect(emojiFileError(fakeFile('a.png', 'image/png'))).toBeNull()
    expect(emojiFileError(fakeFile('a.svg', 'image/svg+xml'))).toBe('Choose a PNG, JPG, GIF or WebP picture.')
  })
})

describe('AddEmoji', () => {
  it('a 4 MB JPEG goes on to the crop step', async () => {
    setup(fakeFile('photo.jpg', 'image/jpeg', 4 * MB))
    const crop = await screen.findByRole('dialog', { name: 'Crop' })
    expect(within(crop).getByRole('button', { name: 'Next' })).toBeInTheDocument()
    expect(within(crop).getByText('reaction')).toBeInTheDocument()
    expect(within(crop).getByText('in text')).toBeInTheDocument()
    expect(within(crop).getByText('on its own')).toBeInTheDocument()
  })

  it('a 3 MB GIF is turned down and stays on the first step', () => {
    setup(fakeFile('big.gif', 'image/gif', 3 * MB))
    expect(screen.getByRole('alert')).toHaveTextContent('GIFs can be up to 2 MB.')
    expect(screen.getByRole('dialog', { name: 'Choose a picture' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Crop' })).toBeNull()
  })

  it('a small GIF skips the crop', () => {
    setup(fakeFile('wave.gif', 'image/gif', MB))
    expect(screen.getByRole('dialog', { name: 'Name it' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Crop' })).toBeNull()
  })

  it('"Choose image" opens the file input, and a chosen file is read and the input reset', async () => {
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Choose image' }))
    expect(click).toHaveBeenCalledTimes(1)
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!
    expect(input.accept).toBe('image/png,image/jpeg,image/gif,image/webp')
    fireEvent.change(input, { target: { files: [fakeFile('photo.png', 'image/png')] } })
    expect(input.value).toBe('')
    await screen.findByRole('dialog', { name: 'Crop' })
  })

  it('names as you type, with live feedback, and adds the cropped PNG', async () => {
    const { onAdded, onClose } = setup(fakeFile('photo.jpg', 'image/jpeg', 4 * MB))
    await cropNext()
    const field = screen.getByRole('textbox', { name: 'Emoji name' })
    const submit = screen.getByRole('button', { name: 'Add emoji' })
    expect(submit).toBeDisabled()

    fireEvent.change(field, { target: { value: 'Moogle' } })
    expect(field).toHaveValue('moogle')
    expect(screen.getByText(':moogle: is already taken.')).toBeInTheDocument()
    expect(submit).toBeDisabled()

    fireEvent.change(field, { target: { value: 'Moogle Wave' } })
    expect(field).toHaveValue('moogle_wave')
    expect(screen.getByText(':moogle_wave: is free')).toBeInTheDocument()
    expect(submit).toBeEnabled()

    fireEvent.click(submit)
    await waitFor(() => expect(onAdded).toHaveBeenCalledWith('moogle_wave'))
    expect(onClose).toHaveBeenCalled()
    const [name, file] = add.mock.calls[0] as [string, File]
    expect(name).toBe('moogle_wave')
    expect(file.name).toBe('emoji.png')
    expect(file.type).toBe('image/png')
  })

  it('a GIF uploads as it is', async () => {
    const gif = fakeFile('wave.gif', 'image/gif', MB)
    const { onAdded } = setup(gif)
    fireEvent.change(screen.getByRole('textbox', { name: 'Emoji name' }), { target: { value: 'wave' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add emoji' }))
    await waitFor(() => expect(onAdded).toHaveBeenCalledWith('wave'))
    expect(add).toHaveBeenCalledWith('wave', gif)
  })

  it('a server error keeps the name step open with the message, until the name changes', async () => {
    add.mockResolvedValue({ error: ':wave: is already taken.' })
    const { onAdded, onClose } = setup(fakeFile('wave.gif', 'image/gif', MB))
    const field = screen.getByRole('textbox', { name: 'Emoji name' })
    fireEvent.change(field, { target: { value: 'wave' } })
    const submit = screen.getByRole('button', { name: 'Add emoji' })
    fireEvent.click(submit)
    expect(await screen.findByText(':wave: is already taken.')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Name it' })).toBeInTheDocument()
    expect(onAdded).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(submit).toBeDisabled()

    fireEvent.change(field, { target: { value: 'wave2' } })
    expect(screen.getByText(':wave2: is free')).toBeInTheDocument()
    expect(submit).toBeEnabled()
  })

  it('shows "Adding…" while it runs', async () => {
    let resolve!: (v: { error: null }) => void
    add.mockReturnValue(new Promise((r) => (resolve = r)))
    setup(fakeFile('wave.gif', 'image/gif', MB))
    fireEvent.change(screen.getByRole('textbox', { name: 'Emoji name' }), { target: { value: 'wave' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add emoji' }))
    expect(screen.getByRole('button', { name: 'Adding…' })).toBeDisabled()
    await act(async () => resolve({ error: null }))
  })

  it('Back from the name step returns to the crop, and Back from the crop to the first step', async () => {
    setup(fakeFile('photo.jpg', 'image/jpeg', 4 * MB))
    await cropNext()
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Name it' })).getByRole('button', { name: 'Back' }))
    const crop = await screen.findByRole('dialog', { name: 'Crop' })
    fireEvent.click(within(crop).getByRole('button', { name: 'Back' }))
    expect(screen.queryByRole('dialog', { name: 'Crop' })).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Choose a picture' })).toBeInTheDocument()
  })
})
