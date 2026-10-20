/** Locale and time zone for date logic. Both default to the runtime's. */
export interface DateOptions {
  locale?: string
  timeZone?: string
}

const DAY_MS = 86_400_000

const keyFormatters = new Map<string, Intl.DateTimeFormat>()

function toDate(value: Date | string): Date {
  return typeof value === 'string' ? new Date(value) : value
}

/** The calendar day of `value` in `timeZone`, as `YYYY-MM-DD`. */
export function localDayKey(value: Date | string, timeZone?: string): string {
  const cacheKey = timeZone ?? ''
  let fmt = keyFormatters.get(cacheKey)
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    keyFormatters.set(cacheKey, fmt)
  }
  const parts = fmt.formatToParts(toDate(value))
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

/** Whole calendar days from `from` to `to` (day keys), ignoring DST. */
export function dayDiff(fromKey: string, toKey: string): number {
  const ms = (key: string) => {
    const [y, m, d] = key.split('-').map(Number)
    return Date.UTC(y, m - 1, d)
  }
  return Math.round((ms(toKey) - ms(fromKey)) / DAY_MS)
}

/**
 * Label for a date chip: TODAY, YESTERDAY, the weekday within the last 7 days,
 * else the short date (with the year when it isn't the current year).
 * Always upper-cased. A future day (clock skew) counts as TODAY.
 */
export function dateChipLabel(date: Date | string, now: Date, options: DateOptions = {}): string {
  const { locale, timeZone } = options
  const d = toDate(date)
  const dayKey = localDayKey(d, timeZone)
  const nowKey = localDayKey(now, timeZone)
  const diff = dayDiff(dayKey, nowKey)
  const upper = (s: string) => s.toLocaleUpperCase(locale)

  if (diff <= 0) return 'TODAY'
  if (diff === 1) return 'YESTERDAY'
  if (diff < 7) return upper(new Intl.DateTimeFormat(locale, { timeZone, weekday: 'long' }).format(d))
  const sameYear = dayKey.slice(0, 4) === nowKey.slice(0, 4)
  return upper(
    new Intl.DateTimeFormat(locale, {
      timeZone,
      month: 'short',
      day: 'numeric',
      ...(sameYear ? {} : { year: 'numeric' }),
    }).format(d),
  )
}

export type ChipItem = { kind: 'chip'; key: string; label: string }
export type RowItem<R> = { kind: 'row'; row: R }
export type ListItem<R> = ChipItem | RowItem<R>

/** Interleaves a date chip before the first row and wherever the local day changes. */
export function insertDateChips<R extends { message: { created_at: string } }>(
  rows: readonly R[],
  now: Date,
  options: DateOptions = {},
): ListItem<R>[] {
  const out: ListItem<R>[] = []
  let lastKey: string | null = null
  for (const row of rows) {
    const key = localDayKey(row.message.created_at, options.timeZone)
    if (key !== lastKey) {
      out.push({ kind: 'chip', key: `chip:${key}`, label: dateChipLabel(row.message.created_at, now, options) })
      lastKey = key
    }
    out.push({ kind: 'row', row })
  }
  return out
}
