import { create } from 'zustand'
import { onAppStateChange } from '@/lib/appLifecycle'
import { setAudioSession } from '@/lib/voice/audioSession'
import { useUiStore } from '@/stores/uiStore'

export type PlayerStatus = 'loading' | 'playing' | 'paused' | 'error'

interface VoicePlayerState {
  /** The memo in the player: a message id, or the composer's preview id. null: nothing loaded. */
  current: string | null
  status: PlayerStatus | null
  /** Seconds into `current`. */
  position: number
  /** Memos whose last attempt failed ("Can't play"); pressing play again retries. */
  failed: Record<string, true>
  /** Plays `id` (pausing any other), or pauses it if it's playing. Resolves true once playback has started. */
  toggle: (id: string, url: string) => Promise<boolean>
  /** Moves `id` to `seconds`, loading it paused if it isn't the current memo. */
  seek: (id: string, url: string, seconds: number) => void
  pause: () => void
  /** Unloads the player (only if `id` is the current memo, when given): its bubble or preview went away. */
  stop: (id?: string) => void
}

let makeAudio: () => HTMLAudioElement = () => new Audio()
let audio: HTMLAudioElement | null = null
let frame = 0
let guarded = false

/** Tests: the next element comes from `factory`. */
export function setAudioFactoryForTests(factory: () => HTMLAudioElement): void {
  makeAudio = factory
  audio = null
}

/** The disguise, the page going to the background and the iOS app's background pause playback. */
function installGuards() {
  if (guarded) return
  guarded = true
  const pause = () => useVoicePlayerStore.getState().pause()
  useUiStore.subscribe((s, prev) => {
    if (s.eepMode && !prev.eepMode) pause()
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') pause()
  })
  onAppStateChange((active) => {
    if (!active) pause()
  })
}

/**
 * One <audio> element for every voice memo, so only one plays at a time. Bubbles, gallery rows and the
 * composer's preview read `current`, `status` and `position` for their own id.
 */
export const useVoicePlayerStore = create<VoicePlayerState>((set, get) => {
  const stopTicking = () => {
    cancelAnimationFrame(frame)
    frame = 0
  }
  // Smooth progress while playing (timeupdate only fires about 4 times a second).
  const tick = () => {
    if (!audio) return
    set({ position: audio.currentTime })
    frame = requestAnimationFrame(tick)
  }
  const markFailed = (id: string) => set({ status: 'error', failed: { ...get().failed, [id]: true } })
  const clearFailed = (id: string) => {
    if (!get().failed[id]) return get().failed
    const next = { ...get().failed }
    delete next[id]
    return next
  }

  const element = (): HTMLAudioElement => {
    if (audio) return audio
    const a = makeAudio()
    a.preload = 'auto'
    a.addEventListener('playing', () => {
      set({ status: 'playing' })
      stopTicking()
      frame = requestAnimationFrame(tick)
    })
    a.addEventListener('waiting', () => {
      if (get().status === 'playing') set({ status: 'loading' })
    })
    a.addEventListener('pause', () => {
      // A switch to another memo already called play() again: that one's events take over.
      if (!a.paused) return
      stopTicking()
      if (get().status !== 'error') set({ status: 'paused', position: a.currentTime })
      setAudioSession('auto')
    })
    a.addEventListener('ended', () => {
      stopTicking()
      set({ status: 'paused', position: 0 })
      setAudioSession('auto')
    })
    a.addEventListener('error', () => {
      const id = get().current
      // stop() clears the source, which some browsers report as an error: only a loaded memo counts.
      if (!id || !a.getAttribute('src')) return
      stopTicking()
      markFailed(id)
      setAudioSession('auto')
    })
    audio = a
    installGuards()
    return a
  }

  return {
    current: null,
    status: null,
    position: 0,
    failed: {},

    toggle: async (id, url) => {
      const a = element()
      const { current, status } = get()
      if (current === id && (status === 'playing' || status === 'loading')) {
        a.pause()
        return false
      }
      if (current !== id || status === 'error') {
        a.pause()
        a.src = url
        set({ current: id, position: 0 })
      }
      set({ status: 'loading', failed: clearFailed(id) })
      setAudioSession('playback')
      try {
        await a.play()
        return get().current === id
      } catch (e) {
        // A pause (or another memo) before playback began: not a failure. The pause handler set the state.
        if ((e as { name?: string } | null)?.name === 'AbortError') return false
        if (get().current === id) markFailed(id)
        setAudioSession('auto')
        return false
      }
    },

    seek: (id, url, seconds) => {
      const a = element()
      if (get().current !== id) {
        a.pause()
        a.src = url
        set({ current: id, status: 'paused' })
      }
      const to = Math.max(0, seconds)
      set({ position: to })
      if (a.readyState >= 1) a.currentTime = to
      else a.addEventListener('loadedmetadata', () => (a.currentTime = to), { once: true })
    },

    pause: () => audio?.pause(),

    stop: (id) => {
      if (id !== undefined && get().current !== id) return
      stopTicking()
      if (audio) {
        audio.pause()
        audio.removeAttribute('src')
        audio.load()
      }
      set({ current: null, status: null, position: 0 })
      setAudioSession('auto')
    },
  }
})
