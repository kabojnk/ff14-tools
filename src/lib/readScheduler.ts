import type { Space } from '@/types'

interface SpaceState {
  /** Newest timestamp asked for (ms). */
  wanted: number | null
  /** Newest timestamp the server confirmed, or that is in flight (ms). */
  floor: number | null
  timer: ReturnType<typeof setTimeout> | null
}

/**
 * Debounces mark_read calls per space and never sends an older timestamp than one already sent.
 * send() failures are swallowed; the next schedule() retries with the newest timestamp.
 */
export function createReadScheduler(send: (space: Space, at: string) => Promise<void>, delayMs = 500) {
  const states: Record<Space, SpaceState> = {
    main: { wanted: null, floor: null, timer: null },
    schist: { wanted: null, floor: null, timer: null },
  }
  const isos: Partial<Record<Space, string>> = {}
  const inFlight = new Set<Promise<void>>()
  let disposed = false

  const fire = (space: Space) => {
    const st = states[space]
    st.timer = null
    const at = st.wanted
    const iso = isos[space]
    if (at === null || !iso || (st.floor !== null && at <= st.floor)) return
    const previousFloor = st.floor
    st.floor = at
    const p = send(space, iso)
      .catch(() => {
        // Let the next schedule() retry. Only roll back if nothing newer has gone out since.
        if (st.floor === at) st.floor = previousFloor
      })
      .finally(() => inFlight.delete(p))
    inFlight.add(p)
  }

  return {
    schedule(space: Space, at: string) {
      if (disposed) return
      const ms = Date.parse(at)
      if (Number.isNaN(ms)) return
      const st = states[space]
      if (st.wanted === null || ms > st.wanted) {
        st.wanted = ms
        isos[space] = at
      }
      if (st.floor !== null && st.wanted <= st.floor) return
      if (st.timer) clearTimeout(st.timer)
      st.timer = setTimeout(() => fire(space), delayMs)
    },

    async flush() {
      for (const space of Object.keys(states) as Space[]) {
        const st = states[space]
        if (st.timer) {
          clearTimeout(st.timer)
          fire(space)
        }
      }
      await Promise.all([...inFlight])
    },

    dispose() {
      disposed = true
      for (const st of Object.values(states)) {
        if (st.timer) clearTimeout(st.timer)
        st.timer = null
      }
    },
  }
}
