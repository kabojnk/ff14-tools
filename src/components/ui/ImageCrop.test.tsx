import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ImageCrop } from './ImageCrop'

describe('ImageCrop', () => {
  let decode: ReturnType<typeof vi.fn>
  let drawImage: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.stubGlobal('matchMedia', undefined)
    decode = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(HTMLImageElement.prototype, 'decode', { configurable: true, value: decode })
    Object.defineProperty(HTMLImageElement.prototype, 'naturalWidth', { configurable: true, get: () => 400 })
    Object.defineProperty(HTMLImageElement.prototype, 'naturalHeight', { configurable: true, get: () => 200 })
    drawImage = vi.fn()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage,
      imageSmoothingQuality: 'low',
    } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, cb, type) {
      cb(new Blob(['x'], { type: type ?? 'image/png' }))
    })
    URL.createObjectURL = vi.fn(() => 'blob:test')
    URL.revokeObjectURL = vi.fn()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete (HTMLImageElement.prototype as { decode?: unknown }).decode
    delete (HTMLImageElement.prototype as { naturalWidth?: unknown }).naturalWidth
    delete (HTMLImageElement.prototype as { naturalHeight?: unknown }).naturalHeight
  })

  const file = new File(['img'], 'photo.png', { type: 'image/png' })

  it('exports an emoji as a PNG named emoji.png at the output size', async () => {
    const onDone = vi.fn()
    render(
      <ImageCrop
        file={file}
        aspect={1}
        output={{ width: 128, height: 128 }}
        type="image/png"
        onCancel={() => {}}
        onDone={onDone}
      />,
    )
    const done = screen.getByRole('button', { name: 'Done' })
    await waitFor(() => expect(done).toBeEnabled())
    await userEvent.click(done)
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    const out = onDone.mock.calls[0][0] as File
    expect(out.name).toBe('emoji.png')
    expect(out.name.endsWith('.png')).toBe(true)
    expect(out.type).toBe('image/png')
    // The same decoded <img> is drawn, centred: a 200×200 square from the middle of 400×200.
    expect(drawImage).toHaveBeenCalledWith(expect.any(HTMLImageElement), 100, 0, 200, 200, 0, 0, 128, 128)
    expect(decode).toHaveBeenCalledTimes(1)
  })

  it('uses a given file name and done label', async () => {
    const onDone = vi.fn()
    render(
      <ImageCrop
        file={file}
        aspect={4}
        output={{ width: 960, height: 240 }}
        type="image/jpeg"
        fileName="cover.jpg"
        doneLabel="Next"
        onCancel={() => {}}
        onDone={onDone}
      />,
    )
    const next = screen.getByRole('button', { name: 'Next' })
    await waitFor(() => expect(next).toBeEnabled())
    await userEvent.click(next)
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect((onDone.mock.calls[0][0] as File).name).toBe('cover.jpg')
  })

  it("reports and shows a failed decode as \"Couldn't open this image.\"", async () => {
    decode.mockRejectedValue(new Error('EncodingError'))
    const onError = vi.fn()
    render(
      <ImageCrop
        file={file}
        aspect={1}
        output={{ width: 128, height: 128 }}
        type="image/png"
        onCancel={() => {}}
        onDone={() => {}}
        onError={onError}
      />,
    )
    await waitFor(() => expect(onError).toHaveBeenCalledWith("Couldn't open this image."))
    expect(screen.getByText("Couldn't open this image.")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled()
  })

  it('zooms with the Zoom slider (1× to 4×) and draws a smaller source', async () => {
    const onDone = vi.fn()
    render(
      <ImageCrop
        file={file}
        aspect={1}
        output={{ width: 128, height: 128 }}
        type="image/png"
        onCancel={() => {}}
        onDone={onDone}
      />,
    )
    const zoom = screen.getByRole('slider', { name: 'Zoom' })
    expect(zoom).toHaveAttribute('min', '1')
    expect(zoom).toHaveAttribute('max', '4')
    const done = screen.getByRole('button', { name: 'Done' })
    await waitFor(() => expect(done).toBeEnabled())
    fireEvent.change(zoom, { target: { value: '2' } })
    await userEvent.click(done)
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(drawImage).toHaveBeenCalledWith(expect.any(HTMLImageElement), 150, 50, 100, 100, 0, 0, 128, 128)
  })

  it('renders the previews at their sizes', async () => {
    render(
      <ImageCrop
        file={file}
        aspect={1}
        output={{ width: 128, height: 128 }}
        type="image/png"
        previews={[16, { size: 44, label: 'on its own' }]}
        onCancel={() => {}}
        onDone={() => {}}
      />,
    )
    await waitFor(() => expect(screen.getByRole('button', { name: 'Done' })).toBeEnabled())
    expect(screen.getByText('on its own')).toBeInTheDocument()
    expect(document.querySelectorAll('[data-crop-preview]')).toHaveLength(2)
  })

  it('cancels', async () => {
    const onCancel = vi.fn()
    render(
      <ImageCrop
        file={file}
        aspect={1}
        output={{ width: 128, height: 128 }}
        type="image/png"
        onCancel={onCancel}
        onDone={() => {}}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
