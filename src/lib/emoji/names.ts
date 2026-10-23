/** Custom emoji names: 2 to 32 of a-z, 0-9 and _ (the database's `custom_emoji_name_format` check). */
const NAME_RE = /^[a-z0-9_]{2,32}$/
const MAX_LENGTH = 32

/** As the user types: lowercases, turns spaces and dashes into _, drops anything else outside a-z0-9_, max 32. */
export function normaliseEmojiName(input: string): string {
  return input
    // Not trimmed: a trailing space is the user typing the next word.
    .replace(/^\s*:+|:+\s*$/g, '')
    .toLowerCase()
    .replace(/[\s-]/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, MAX_LENGTH)
}

/** null when valid; otherwise the message to show. */
export function emojiNameError(name: string, taken: ReadonlySet<string>): string | null {
  if (name.length < 2) return 'Use at least 2 characters.'
  if (!NAME_RE.test(name)) return 'Use lowercase letters, numbers and _ only.'
  if (taken.has(name)) return `:${name}: is already taken.`
  return null
}
