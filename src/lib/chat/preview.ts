import { dayDiff, localDayKey, type DateOptions } from './dates'
import type { Attachment, Message } from '@/types'

const ATTACHMENT_LABEL: Record<Attachment['type'], string> = {
  image: 'Photo',
  video: 'Video',
  gif: 'GIF',
  audio: 'Voice message',
  file: 'File',
}

/** One line for the conversation list: the text's first line, else what was attached. */
export function messagePreview(m: Pick<Message, 'content' | 'attachments' | 'type'>): string {
  const firstLine = (m.content ?? '').trim().split('\n')[0].replace(/\s+/g, ' ').trim()
  if (firstLine) return firstLine
  const first = m.attachments?.[0]
  if (first) return ATTACHMENT_LABEL[first.type] ?? 'Attachment'
  if (m.type === 'gif') return 'GIF'
  return 'Message'
}

/** The time on a conversation row: the time today, Yesterday, the weekday this week, else the date. */
export function listTimeLabel(date: Date | string, now: Date, options: DateOptions = {}): string {
  const { locale, timeZone } = options
  const d = typeof date === 'string' ? new Date(date) : date
  const dayKey = localDayKey(d, timeZone)
  const nowKey = localDayKey(now, timeZone)
  const diff = dayDiff(dayKey, nowKey)
  if (diff <= 0) return new Intl.DateTimeFormat(locale, { timeZone, hour: 'numeric', minute: '2-digit' }).format(d)
  if (diff === 1) return 'Yesterday'
  if (diff < 7) return new Intl.DateTimeFormat(locale, { timeZone, weekday: 'short' }).format(d)
  const sameYear = dayKey.slice(0, 4) === nowKey.slice(0, 4)
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(d)
}
