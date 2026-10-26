import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MicButton, VoicePanel } from '@/components/chat2/VoiceComposer'
import type { VoiceSession } from '@/components/chat2/useVoiceSession'
import { WARN_AT_MS } from '@/lib/voice/recorder'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))

function session(over: Partial<VoiceSession> = {}): VoiceSession {
  return {
    phase: 'idle', elapsedMs: 0, levels: [0.2, 0.5], drag: { dx: 0, dy: 0 }, preview: null, hint: null,
    press: { onPointerDown: vi.fn(), onPointerMove: vi.fn(), onPointerUp: vi.fn(), onPointerCancel: vi.fn(), onClick: vi.fn() },
    stopToPreview: vi.fn(), send: vi.fn(), discard: vi.fn(), ...over,
  }
}

describe('MicButton', () => {
  it('is the mic when idle, "Release to send" while holding, Send when locked or previewing', () => {
    const { rerender } = render(<MicButton session={session()} />)
    expect(screen.getByRole('button', { name: 'Record a voice message' })).toBeInTheDocument()
    rerender(<MicButton session={session({ phase: 'holding' })} />)
    expect(screen.getByRole('button', { name: 'Release to send' })).toBeInTheDocument()
    rerender(<MicButton session={session({ phase: 'locked' })} />)
    expect(screen.getByRole('button', { name: 'Send voice message' })).toBeInTheDocument()
  })
})

describe('VoicePanel', () => {
  it('holding: the timer and "Slide to cancel"', () => {
    render(<VoicePanel session={session({ phase: 'holding', elapsedMs: 84_000 })} isDesktop={false} />)
    expect(screen.getByText('1:24')).toBeInTheDocument()
    expect(screen.getByText('‹ Slide to cancel')).toBeInTheDocument()
  })

  it('locked: Delete, the timer, Stop; red with time left near the limit', () => {
    const s = session({ phase: 'locked', elapsedMs: WARN_AT_MS + 11_000 })
    render(<VoicePanel session={s} isDesktop={false} />)
    expect(screen.getByText('9:41 · 0:19 left')).toHaveAttribute('data-warn')
    fireEvent.click(screen.getByRole('button', { name: 'Stop and preview' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete recording' }))
    expect(s.stopToPreview).toHaveBeenCalled()
    expect(s.discard).toHaveBeenCalled()
  })

  it('preview: play and the length', () => {
    const recording = { blob: new Blob(), format: { mimeType: 'audio/mp4', ext: 'm4a' as const, bitsPerSecond: 1 }, durationMs: 84_000, peaks: [] }
    render(<VoicePanel session={session({ phase: 'preview', preview: { recording, url: 'blob:p' } })} isDesktop={false} />)
    expect(screen.getByRole('button', { name: 'Play preview' })).toBeInTheDocument()
    expect(screen.getByText('1:24')).toBeInTheDocument()
  })

  it('desktop: Enter sends and Esc deletes while locked', () => {
    const s = session({ phase: 'locked' })
    render(<VoicePanel session={s} isDesktop />)
    fireEvent.keyDown(window, { key: 'Enter' })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(s.send).toHaveBeenCalled()
    expect(s.discard).toHaveBeenCalled()
  })
})
