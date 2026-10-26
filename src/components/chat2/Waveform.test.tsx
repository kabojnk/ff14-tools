import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Waveform, resample } from '@/components/chat2/Waveform'

const peaks = Array.from({ length: 48 }, (_, i) => (i * 2) % 100)

describe('resample', () => {
  it('fits any number of peaks into the bar count, and fills missing ones', () => {
    expect(resample(peaks, 40)).toHaveLength(40)
    expect(resample([10, 90], 4)).toEqual([10, 10, 90, 90])
    expect(resample(undefined, 3)).toEqual([30, 30, 30])
  })
})

describe('Waveform', () => {
  it('is a slider with the position as text', () => {
    render(<Waveform peaks={peaks} position={7} duration={19} onSeek={() => {}} label="Voice message position" />)
    const slider = screen.getByRole('slider', { name: 'Voice message position' })
    expect(slider).toHaveAttribute('aria-valuemin', '0')
    expect(slider).toHaveAttribute('aria-valuemax', '19')
    expect(slider).toHaveAttribute('aria-valuenow', '7')
    expect(slider).toHaveAttribute('aria-valuetext', '0:07 of 0:19')
  })

  it('arrow keys step 5 s, Home and End jump, within bounds', () => {
    const onSeek = vi.fn()
    render(<Waveform peaks={peaks} position={3} duration={19} onSeek={onSeek} label="p" />)
    const slider = screen.getByRole('slider')
    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    fireEvent.keyDown(slider, { key: 'ArrowLeft' })
    fireEvent.keyDown(slider, { key: 'End' })
    fireEvent.keyDown(slider, { key: 'Home' })
    expect(onSeek.mock.calls.map((c) => c[0])).toEqual([8, 0, 19, 0])
  })

  it('a tap seeks to that point', () => {
    const onSeek = vi.fn()
    render(<Waveform peaks={peaks} position={0} duration={20} onSeek={onSeek} label="p" />)
    const slider = screen.getByRole('slider')
    slider.getBoundingClientRect = () => ({ left: 100, width: 200, top: 0, height: 28, right: 300, bottom: 28, x: 100, y: 0, toJSON: () => ({}) })
    // jsdom has no PointerEvent: a MouseEvent named pointerdown carries clientX.
    fireEvent(slider, new MouseEvent('pointerdown', { bubbles: true, clientX: 150 }))
    expect(onSeek).toHaveBeenCalledWith(5)
  })

  it('shows a thumb at the position only when asked', () => {
    const { container, rerender } = render(<Waveform peaks={peaks} position={5} duration={20} onSeek={() => {}} label="p" />)
    expect(container.querySelector('[data-thumb]')).toBeNull()
    rerender(<Waveform peaks={peaks} position={5} duration={20} onSeek={() => {}} label="p" thumb />)
    expect(container.querySelector<HTMLElement>('[data-thumb]')?.style.left).toBe('25%')
  })

  it('colours the bars up to the position', () => {
    const { container } = render(<Waveform peaks={peaks} position={10} duration={20} onSeek={() => {}} label="p" bars={10} />)
    expect(container.querySelectorAll('[data-bar="on"]')).toHaveLength(5)
    expect(container.querySelectorAll('[data-bar="off"]')).toHaveLength(5)
  })
})
