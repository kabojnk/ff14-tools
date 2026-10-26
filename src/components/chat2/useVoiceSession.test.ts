import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@supabase/supabase-js'

const { startRecording, sendVoiceMemo, discardUnsentVoice, recorder, stopPlayer } = vi.hoisted(() => {
  const recorder = {
    elapsedMs: vi.fn(() => 1000),
    stop: vi.fn(async () => ({ blob: new Blob(['a'], { type: 'audio/mp4' }), format: { mimeType: 'audio/mp4', ext: 'm4a', bitsPerSecond: 1 }, durationMs: 1000, peaks: [] })),
    discard: vi.fn(),
  }
  return {
    recorder,
    startRecording: vi.fn(async (_o?: { onLimit?: () => void }) => recorder),
    sendVoiceMemo: vi.fn(async () => {}),
    discardUnsentVoice: vi.fn(),
    stopPlayer: vi.fn(),
  }
})
vi.mock('@/lib/voice/recorder', async (orig) => ({ ...(await orig<typeof import('@/lib/voice/recorder')>()), startRecording }))
vi.mock('@/lib/chat/voice', () => ({ sendVoiceMemo, discardUnsentVoice }))
vi.mock('@/lib/supabase', () => ({ supabase: {} }))

import { useVoiceSession } from '@/components/chat2/useVoiceSession'
import { VoiceError } from '@/lib/voice/recorder'
import { useAuthStore } from '@/stores/authStore'
import { useUiStore } from '@/stores/uiStore'
import { useVoicePlayerStore } from '@/stores/voicePlayer'

const sendTyping = vi.fn()
const stopTyping = vi.fn()
const onSent = vi.fn()

function setup() {
  return renderHook(() =>
    useVoiceSession({ conversationId: 'c1', space: 'main', replyTo: null, onSent, sendTyping, stopTyping }),
  )
}
type Session = ReturnType<typeof setup>['result']

const target = { setPointerCapture: () => {} }
const pe = (type: string, pointerType: string, x = 300, y = 600) =>
  ({ pointerId: 1, pointerType, button: 0, clientX: x, clientY: y, currentTarget: target, preventDefault: () => {}, type }) as never

async function press(r: Session, pointerType = 'touch') {
  await act(async () => r.current.press.onPointerDown(pe('pointerdown', pointerType)))
}
async function release(r: Session, afterMs: number) {
  act(() => vi.advanceTimersByTime(afterMs))
  await act(async () => r.current.press.onPointerUp(pe('pointerup', 'touch')))
}

beforeEach(() => {
  vi.useFakeTimers()
  useAuthStore.setState({ user: { id: 'alice' } as User })
  useUiStore.setState({ eepMode: false, pinLocked: false })
  useVoicePlayerStore.setState({ stop: stopPlayer })
  URL.createObjectURL = vi.fn(() => 'blob:preview')
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => vi.useRealTimers())

describe('useVoiceSession', () => {
  it('hold then release after 0.5 s sends, and says "recording" meanwhile', async () => {
    const { result } = setup()
    await press(result)
    expect(result.current.phase).toBe('holding')
    expect(sendTyping).toHaveBeenCalledWith('recording')
    await release(result, 1200)
    expect(result.current.phase).toBe('idle')
    expect(recorder.stop).toHaveBeenCalled()
    expect(sendVoiceMemo).toHaveBeenCalledWith(expect.objectContaining({ authorId: 'alice', conversationId: 'c1', space: 'main', replyTo: null }))
    expect(onSent).toHaveBeenCalled()
    expect(stopTyping).toHaveBeenCalled()
  })

  it('a short tap records nothing and hints', async () => {
    const { result } = setup()
    await press(result)
    await release(result, 200)
    expect(recorder.discard).toHaveBeenCalled()
    expect(sendVoiceMemo).not.toHaveBeenCalled()
    expect(result.current.hint).toBe('Hold to record')
    act(() => vi.advanceTimersByTime(3000))
    expect(result.current.hint).toBeNull()
  })

  it('sliding left cancels', async () => {
    const { result } = setup()
    await press(result)
    await act(async () => result.current.press.onPointerMove(pe('pointermove', 'touch', 160, 600)))
    expect(result.current.phase).toBe('idle')
    expect(recorder.discard).toHaveBeenCalled()
  })

  it('sliding up locks; the release does nothing; Send sends', async () => {
    const { result } = setup()
    await press(result)
    await act(async () => result.current.press.onPointerMove(pe('pointermove', 'touch', 300, 500)))
    expect(result.current.phase).toBe('locked')
    await release(result, 2000)
    expect(result.current.phase).toBe('locked')
    await act(async () => result.current.send())
    expect(sendVoiceMemo).toHaveBeenCalledTimes(1)
  })

  it('a mouse press records locked; the click that follows is not a Send', async () => {
    const { result } = setup()
    await press(result, 'mouse')
    expect(result.current.phase).toBe('locked')
    await act(async () => result.current.press.onClick({ detail: 1 } as never))
    expect(sendVoiceMemo).not.toHaveBeenCalled()
  })

  it('keyboard activation records locked', async () => {
    const { result } = setup()
    await act(async () => result.current.press.onClick({ detail: 0 } as never))
    expect(result.current.phase).toBe('locked')
  })

  it('Stop shows the preview; Send sends it; Delete drops it', async () => {
    const { result } = setup()
    await act(async () => result.current.press.onClick({ detail: 0 } as never))
    await act(async () => result.current.stopToPreview())
    expect(result.current.phase).toBe('preview')
    expect(result.current.preview?.url).toBe('blob:preview')
    await act(async () => result.current.send())
    expect(sendVoiceMemo).toHaveBeenCalledTimes(1)
    expect(stopPlayer).toHaveBeenCalled()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview')
    expect(result.current.phase).toBe('idle')
  })

  it('10:00 goes to the preview even while holding', async () => {
    const { result } = setup()
    await press(result)
    const opts = startRecording.mock.calls[0][0]!
    await act(async () => opts.onLimit?.())
    expect(result.current.phase).toBe('preview')
    await release(result, 100)
    expect(result.current.phase).toBe('preview')
  })

  it('the disguise discards a recording and unsent memos', async () => {
    const { result } = setup()
    await act(async () => result.current.press.onClick({ detail: 0 } as never))
    act(() => useUiStore.setState({ eepMode: true }))
    expect(result.current.phase).toBe('idle')
    expect(recorder.discard).toHaveBeenCalled()
    expect(discardUnsentVoice).toHaveBeenCalled()
  })

  it('the page going to the background discards', async () => {
    const { result } = setup()
    await act(async () => result.current.press.onClick({ detail: 0 } as never))
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
    expect(result.current.phase).toBe('idle')
  })

  it('a refused microphone goes back to idle with a hint', async () => {
    startRecording.mockRejectedValueOnce(new VoiceError('denied'))
    const { result } = setup()
    await press(result)
    expect(result.current.phase).toBe('idle')
    expect(result.current.hint).toMatch(/^Microphone access is off/)
  })

  it('stops announcing "recording" once the memo is sent', async () => {
    const { result } = setup()
    await press(result)
    await release(result, 1200)
    sendTyping.mockClear()
    act(() => vi.advanceTimersByTime(1000))
    expect(sendTyping).not.toHaveBeenCalled()
  })

  it('Stop and the limit at once make one preview', async () => {
    const { result } = setup()
    await act(async () => result.current.press.onClick({ detail: 0 } as never))
    const opts = startRecording.mock.calls[0][0]!
    await act(async () => {
      result.current.stopToPreview()
      opts.onLimit?.()
    })
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
    expect(result.current.phase).toBe('preview')
  })

  it('unmounting discards', async () => {
    const { result, unmount } = setup()
    await act(async () => result.current.press.onClick({ detail: 0 } as never))
    unmount()
    await act(async () => {})
    expect(recorder.discard).toHaveBeenCalled()
  })
})
