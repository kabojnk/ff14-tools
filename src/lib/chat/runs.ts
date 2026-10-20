import type { Message } from '@/types'
import { localDayKey } from './dates'

export type RunMessage = Pick<Message, 'author_id' | 'created_at' | 'type'>

export interface RunRow<M> {
  message: M
  /** First bubble of a run (gets the tail and the author's spacing). */
  runStart: boolean
  /** Last bubble of a run. */
  runEnd: boolean
}

export interface GroupRunsOptions {
  /** Longest pause that still continues a run. Default 5 minutes. */
  gapMs?: number
  /** Zone for the day-change rule. Default: the runtime's. */
  timeZone?: string
}

function continues(prev: RunMessage, next: RunMessage, gapMs: number, timeZone?: string): boolean {
  if (prev.type === 'system' || next.type === 'system') return false
  if (prev.author_id !== next.author_id) return false
  if (Date.parse(next.created_at) - Date.parse(prev.created_at) > gapMs) return false
  return localDayKey(prev.created_at, timeZone) === localDayKey(next.created_at, timeZone)
}

/**
 * Splits messages (oldest first) into runs: one author, no pause longer than
 * `gapMs`, same local day, never including a system message. Callers filter
 * out deleted messages first.
 */
export function groupRuns<M extends RunMessage>(
  messages: readonly M[],
  { gapMs = 5 * 60_000, timeZone }: GroupRunsOptions = {},
): RunRow<M>[] {
  const joins = messages.map((m, i) => i > 0 && continues(messages[i - 1], m, gapMs, timeZone))
  return messages.map((message, i) => ({
    message,
    runStart: !joins[i],
    runEnd: i === messages.length - 1 || !joins[i + 1],
  }))
}
