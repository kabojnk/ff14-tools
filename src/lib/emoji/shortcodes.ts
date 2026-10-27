/**
 * `:shortcode:` emoji for the composer's autocomplete, Discord style. The names are emojibase's iamcal set
 * (the Slack/Discord names: :joy:, :thumbsup:, :+1:). Custom emoji match by their own names.
 */

export interface ShortcodeEmoji {
  emoji: string
  /** Every name for it, without colons; the first is the one shown. */
  codes: string[]
}

export type EmojiSuggestion =
  | { kind: 'standard'; emoji: string; code: string }
  | { kind: 'custom'; name: string; url: string }

/** Typing `:` and at least this many characters opens the suggestions (as in Discord). */
export const MIN_QUERY = 2
export const MAX_SUGGESTIONS = 8

/** The suggestion list's element ids (the field points at the list and its active option). */
export const EMOJI_SUGGESTIONS_ID = 'composer-emoji-suggestions'
export const suggestionId = (i: number) => `${EMOJI_SUGGESTIONS_ID}-${i}`

let loading: Promise<ShortcodeEmoji[]> | null = null

/** Loads the shortcode index once (two dynamic imports, fetched the first time a `:` query is typed). */
export function loadShortcodes(): Promise<ShortcodeEmoji[]> {
  loading ??= Promise.all([import('emojibase-data/en/compact.json'), import('emojibase-data/en/shortcodes/iamcal.json')])
    .then(([compact, codes]) =>
      buildIndex(
        (compact as unknown as { default: { hexcode: string; unicode: string }[] }).default,
        (codes as unknown as { default: Record<string, string | string[]> }).default,
      ),
    )
    .catch((err: unknown) => {
      loading = null // a failed chunk load can be retried on the next query
      throw err
    })
  return loading
}

export function buildIndex(emoji: { hexcode: string; unicode: string }[], codes: Record<string, string | string[]>): ShortcodeEmoji[] {
  const out: ShortcodeEmoji[] = []
  for (const e of emoji) {
    const c = codes[e.hexcode]
    if (!c) continue
    out.push({ emoji: e.unicode, codes: Array.isArray(c) ? c : [c] })
  }
  return out
}

/**
 * The `:query` being typed right before the caret, or null. It must start the text or follow a space or
 * an opening bracket, so times (10:30) and links (https://) don't open the list.
 */
export function shortcodeQueryAt(text: string, caret: number): { start: number; query: string } | null {
  const m = /(?:^|[\s(])(:([a-z0-9_+-]+))$/i.exec(text.slice(0, caret))
  if (!m || m[2].length < MIN_QUERY) return null
  return { start: caret - m[1].length, query: m[2].toLowerCase() }
}

/**
 * Up to `limit` matches: names that start with the query first (custom emoji before standard ones, then the
 * shortest name), then names that contain it.
 */
export function suggestEmoji(
  index: ShortcodeEmoji[],
  custom: Record<string, string>,
  query: string,
  limit = MAX_SUGGESTIONS,
): EmojiSuggestion[] {
  const q = query.toLowerCase()
  type Hit = { s: EmojiSuggestion; prefix: boolean; length: number; custom: boolean }
  const hits: Hit[] = []
  for (const [name, url] of Object.entries(custom)) {
    const prefix = name.startsWith(q)
    if (prefix || name.includes(q)) hits.push({ s: { kind: 'custom', name, url }, prefix, length: name.length, custom: true })
  }
  for (const e of index) {
    const code = e.codes.find((c) => c.startsWith(q)) ?? e.codes.find((c) => c.includes(q))
    if (!code) continue
    hits.push({ s: { kind: 'standard', emoji: e.emoji, code }, prefix: code.startsWith(q), length: code.length, custom: false })
  }
  hits.sort((a, b) => Number(b.prefix) - Number(a.prefix) || Number(b.custom) - Number(a.custom) || a.length - b.length)
  return hits.slice(0, limit).map((h) => h.s)
}

/** A standard emoji whose name is exactly `code`, for converting a finished `:code:`. */
export function emojiForCode(index: ShortcodeEmoji[], code: string): string | null {
  const c = code.toLowerCase()
  return index.find((e) => e.codes.includes(c))?.emoji ?? null
}

/** The `:code:` just finished (the caret is right after its closing colon), or null. */
export function finishedShortcodeAt(text: string, caret: number): { start: number; code: string } | null {
  const m = /(?:^|[\s(])(:([a-z0-9_+-]+):)$/i.exec(text.slice(0, caret))
  if (!m) return null
  return { start: caret - m[1].length, code: m[2] }
}

/** What a suggestion puts in the text: the emoji itself, or a custom emoji's `:name:`. */
export function suggestionText(s: EmojiSuggestion): string {
  return s.kind === 'standard' ? s.emoji : `:${s.name}:`
}
