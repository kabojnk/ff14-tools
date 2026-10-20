const KEY = 'recentEmoji'
const MAX = 6

/** The quick bar before anything has been used. */
export const DEFAULT_RECENT = ['❤️', '😂', '👍', '😮', '😢', '🔥']

function read(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((e): e is string => typeof e === 'string' && e.length > 0) : []
  } catch {
    return []
  }
}

/** Six emoji for the quick-react bar: the most recently used first, topped up with the defaults. */
export function recentEmoji(): string[] {
  const list = read()
  for (const e of DEFAULT_RECENT) if (!list.includes(e)) list.push(e)
  return list.slice(0, MAX)
}

/** Remembers a reaction I just added (per device). */
export function noteRecentEmoji(emoji: string) {
  const list = [emoji, ...read().filter((e) => e !== emoji)].slice(0, MAX)
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    // Storage blocked (private mode): the bar just keeps its defaults.
  }
}
