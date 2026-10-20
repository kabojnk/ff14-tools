const KEY = 'recentEmoji'
/** Picks kept per device (the picker's Recent tab). Custom emoji are stored as `:name:`. */
const MAX = 24

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

/** `count` emoji (six by default) for the quick-react bar: the most recently used first, topped up with the defaults. */
export function recentEmoji(count = 6): string[] {
  const list = read().slice(0, count)
  for (const e of DEFAULT_RECENT) if (!list.includes(e)) list.push(e)
  return list.slice(0, count)
}

/** Only real picks (no defaults), latest first, up to 24: the picker's Recent tab. */
export function recentEmojiList(): string[] {
  return read().slice(0, MAX)
}

/** Remembers an emoji I just used (per device). */
export function noteRecentEmoji(emoji: string) {
  const list = [emoji, ...read().filter((e) => e !== emoji)].slice(0, MAX)
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    // Storage blocked (private mode): the bar just keeps its defaults.
  }
}
