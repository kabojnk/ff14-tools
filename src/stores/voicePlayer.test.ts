import { beforeEach, describe, expect, it, vi } from 'vitest'

const setAudioSession = vi.hoisted(() => vi.fn())
vi.mock('@/lib/voice/audioSession', () => ({ setAudioSession }))

import { setAudioFactoryForTests, useVoicePlayerStore } from '@/stores/voicePlayer'
import { useUiStore } from '@/stores/uiStore'

class FakeAudio extends EventTarget {
  src = ''
  preload = ''
  currentTime = 0
  readyState = 4
  paused = true
  failNext = false
  play = vi.fn(async () => {
    if (this.failNext) {
      this.failNext = false
      throw new DOMException('nope', 'NotSupportedError')
    }
    this.paused = false
    this.dispatchEvent(new Event('playing'))
  })
  pause = vi.fn(() => {
    if (this.paused) return
    this.paused = true
    this.dispatchEvent(new Event('pause'))
  })
  load = vi.fn()
  getAttribute(name: string) {
    return name === 'src' && this.src ? this.src : null
  }
  removeAttribute() {
    this.src = ''
  }
}

let audio: FakeAudio
const store = () => useVoicePlayerStore.getState()

beforeEach(() => {
  audio = new FakeAudio()
  setAudioFactoryForTests(() => audio as unknown as HTMLAudioElement)
  useVoicePlayerStore.setState({ current: null, status: null, position: 0, failed: {} })
  useUiStore.setState({ eepMode: false })
})

describe('voicePlayer', () => {
  it('plays a memo, with the playback audio session', async () => {
    expect(await store().toggle('m1', 'https://cdn/a.m4a')).toBe(true)
    expect(audio.src).toBe('https://cdn/a.m4a')
    expect(store()).toMatchObject({ current: 'm1', status: 'playing' })
    expect(setAudioSession).toHaveBeenCalledWith('playback')
  })

  it('toggling the playing memo pauses it', async () => {
    await store().toggle('m1', 'a')
    expect(await store().toggle('m1', 'a')).toBe(false)
    expect(store().status).toBe('paused')
    expect(setAudioSession).toHaveBeenLastCalledWith('auto')
  })

  it('one at a time: playing another memo switches the source', async () => {
    await store().toggle('m1', 'a')
    await store().toggle('m2', 'b')
    expect(audio.src).toBe('b')
    expect(store()).toMatchObject({ current: 'm2', status: 'playing', position: 0 })
  })

  it('a failed play is "Can\'t play", and pressing again retries', async () => {
    audio.failNext = true
    expect(await store().toggle('m1', 'a')).toBe(false)
    expect(store().status).toBe('error')
    expect(store().failed.m1).toBe(true)
    expect(await store().toggle('m1', 'a')).toBe(true)
    expect(store().failed.m1).toBeUndefined()
  })

  it('pausing while it loads is a pause, not "Can\'t play"', async () => {
    audio.play.mockImplementationOnce(async () => {
      audio.paused = false
      audio.pause()
      throw new DOMException('interrupted', 'AbortError')
    })
    expect(await store().toggle('m1', 'a')).toBe(false)
    expect(store().status).toBe('paused')
    expect(store().failed.m1).toBeUndefined()
  })

  it('seeking another memo loads it paused at that point', () => {
    store().seek('m3', 'c', 7)
    expect(audio.src).toBe('c')
    expect(audio.currentTime).toBe(7)
    expect(store()).toMatchObject({ current: 'm3', status: 'paused', position: 7 })
  })

  it('seeking waits for metadata when it has none yet', () => {
    audio.readyState = 0
    store().seek('m3', 'c', 5)
    expect(audio.currentTime).toBe(0)
    audio.dispatchEvent(new Event('loadedmetadata'))
    expect(audio.currentTime).toBe(5)
  })

  it('stop(id) only stops that memo', async () => {
    await store().toggle('m1', 'a')
    store().stop('m2')
    expect(store().current).toBe('m1')
    store().stop('m1')
    expect(store()).toMatchObject({ current: null, status: null })
    expect(audio.src).toBe('')
  })

  it('the end of a memo goes back to the start', async () => {
    await store().toggle('m1', 'a')
    audio.paused = true
    audio.dispatchEvent(new Event('ended'))
    expect(store()).toMatchObject({ current: 'm1', status: 'paused', position: 0 })
  })

  it('pauses when the disguise comes up', async () => {
    await store().toggle('m1', 'a')
    useUiStore.setState({ eepMode: true })
    expect(audio.pause).toHaveBeenCalled()
    expect(store().status).toBe('paused')
  })

  it('pauses when the page goes to the background', async () => {
    await store().toggle('m1', 'a')
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
    expect(store().status).toBe('paused')
  })
})
