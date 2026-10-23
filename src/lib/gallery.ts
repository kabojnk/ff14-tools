/** Items (newest first) into month groups: "October", or "September 2025" outside the current year. */
export function groupByMonth<T extends { created_at: string }>(items: T[], now: Date): { label: string; items: T[] }[] {
  const groups: { key: string; label: string; items: T[] }[] = []
  for (const item of items) {
    const d = new Date(item.created_at)
    const key = `${d.getFullYear()}-${d.getMonth()}`
    const last = groups[groups.length - 1]
    if (last?.key === key) {
      last.items.push(item)
      continue
    }
    const month = d.toLocaleDateString(undefined, { month: 'long' })
    groups.push({ key, label: d.getFullYear() === now.getFullYear() ? month : `${month} ${d.getFullYear()}`, items: [item] })
  }
  return groups.map(({ label, items: groupItems }) => ({ label, items: groupItems }))
}

/** A link item's large and small lines: "example.com" and "example.com/guide". Strips "www.", keeps the full address small; the host only when the URL doesn't parse. */
export function linkLabel(url: string): { site: string; address: string } {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { site: url.trim(), address: '' }
  }
  const site = parsed.host.replace(/^www\./i, '')
  const path = parsed.pathname === '/' ? '' : parsed.pathname
  return { site, address: `${site}${path}${parsed.search}${parsed.hash}` }
}

/** 0:42, 1:05, 1:02:03. */
export function formatDuration(seconds: number): string {
  const total = Math.round(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = String(total % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

export interface SerialQueue {
  /** Queue a job; `start` runs once every earlier job is done or cancelled. Repeats for a queued key are ignored. */
  request(key: object, start: () => void): void
  /** The job finished: start the next. */
  done(key: object): void
  /** Drop a waiting job, or free the slot if it's the running one. */
  cancel(key: object): void
}

/** Runs one job at a time (the gallery reads one video's metadata at a time). */
export function createSerialQueue(): SerialQueue {
  const waiting: { key: object; start: () => void }[] = []
  let running: object | null = null
  const pump = () => {
    if (running !== null) return
    const next = waiting.shift()
    if (!next) return
    running = next.key
    next.start()
  }
  return {
    request(key, start) {
      if (running === key || waiting.some((w) => w.key === key)) return
      waiting.push({ key, start })
      pump()
    },
    done(key) {
      if (running !== key) return
      running = null
      pump()
    },
    cancel(key) {
      const i = waiting.findIndex((w) => w.key === key)
      if (i >= 0) waiting.splice(i, 1)
      if (running === key) {
        running = null
        pump()
      }
    },
  }
}

/** A gallery row's date: the time today, "11 Sep" this year, "11 Sep 2025" before. */
export function formatItemDate(iso: string, now: Date): string {
  const d = new Date(iso)
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return d.toLocaleDateString([], {
    day: 'numeric',
    month: 'short',
    ...(d.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  })
}
