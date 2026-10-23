export type EmojiTabId =
  | 'recent'
  | 'custom'
  | 'smileys'
  | 'nature'
  | 'food'
  | 'activities'
  | 'travel'
  | 'objects'
  | 'symbols'
  | 'flags'

export interface StandardEmoji {
  emoji: string
  label: string
  tags: string[]
  tab: EmojiTabId
}

/** The fields we use from emojibase-data's compact.json (declared here rather than importing the `emojibase` peer's type). */
interface CompactEmoji {
  label: string
  unicode: string
  group?: number
  order?: number
  tags?: string[]
}

/**
 * emojibase groups (checked against emojibase-data 16.0.3): 0 smileys & emotion, 1 people & body,
 * 2 component (skin tones, hair; dropped), 3 animals & nature, 4 food & drink, 5 travel & places,
 * 6 activities, 7 objects, 8 symbols, 9 flags. Entries without a group (regional indicators) are dropped.
 */
const GROUP_TABS: Record<number, EmojiTabId> = {
  0: 'smileys',
  1: 'smileys',
  3: 'nature',
  4: 'food',
  5: 'travel',
  6: 'activities',
  7: 'objects',
  8: 'symbols',
  9: 'flags',
}

let loading: Promise<StandardEmoji[]> | null = null

/** Loads emojibase-data/en/compact.json once (dynamic import), drops the 'component' group and entries without a group, maps groups to tabs, keeps `order`. */
export function loadEmoji(): Promise<StandardEmoji[]> {
  loading ??= import('emojibase-data/en/compact.json')
    .then((mod) => toStandard((mod as unknown as { default: CompactEmoji[] }).default))
    .catch((err: unknown) => {
      loading = null // a failed chunk load can be retried on the next open
      throw err
    })
  return loading
}

function toStandard(data: CompactEmoji[]): StandardEmoji[] {
  // Skin-tone variants live under `skins`, not at the top level, so none appear (no skin tones, by choice).
  return data
    .filter((e) => e.group !== undefined && GROUP_TABS[e.group] !== undefined)
    .sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity))
    .map((e) => ({ emoji: e.unicode, label: e.label, tags: e.tags ?? [], tab: GROUP_TABS[e.group as number] }))
}

/** 0 = the query starts a word or tag, 1 = it appears inside one, -1 = no match. */
function rank(words: string[], q: string): number {
  let best = -1
  for (const w of words) {
    if (w.startsWith(q)) return 0
    if (best < 0 && w.includes(q)) best = 1
  }
  return best
}

function ranked<T>(items: T[], words: (item: T) => string[], q: string): T[] {
  const prefix: T[] = []
  const inner: T[] = []
  for (const item of items) {
    const r = rank(words(item), q)
    if (r === 0) prefix.push(item)
    else if (r === 1) inner.push(item)
  }
  return [...prefix, ...inner]
}

/** Case-insensitive match on label words and tags, prefix first; custom names match too (returned separately). */
export function searchEmoji(
  all: StandardEmoji[],
  custom: { name: string }[],
  query: string,
): { standard: StandardEmoji[]; custom: string[] } {
  const q = query.trim().replace(/^:+|:+$/g, '').toLowerCase()
  if (!q) return { standard: [], custom: [] }
  const standard = ranked(all, (e) => [e.label.toLowerCase(), ...e.label.toLowerCase().split(/[^\p{L}\p{N}]+/u), ...e.tags], q)
  const customNames = ranked(
    custom.map((c) => c.name),
    (name) => [name, ...name.split('_')],
    q,
  )
  return { standard, custom: customNames }
}
