import { afterEach, describe, expect, it } from 'vitest'
import { setAudioSession } from '@/lib/voice/audioSession'

type Nav = Navigator & { audioSession?: { type: string } }

afterEach(() => {
  delete (navigator as Nav).audioSession
})

describe('setAudioSession', () => {
  it('sets the Audio Session type where the API exists', () => {
    ;(navigator as Nav).audioSession = { type: 'auto' }
    setAudioSession('playback')
    expect((navigator as Nav).audioSession?.type).toBe('playback')
  })

  it('does nothing where it is missing', () => {
    expect(() => setAudioSession('play-and-record')).not.toThrow()
  })

  it('keeps going when the value is refused', () => {
    ;(navigator as Nav).audioSession = {
      get type() {
        return 'auto'
      },
      set type(_v: string) {
        throw new TypeError('unsupported')
      },
    }
    expect(() => setAudioSession('playback')).not.toThrow()
  })
})
