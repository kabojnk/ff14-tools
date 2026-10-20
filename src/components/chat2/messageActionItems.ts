import { Copy, Eye, EyeOff, Pencil, Pin, PinOff, Reply, Trash2, type LucideIcon } from 'lucide-react'
import type { Attachment, Message } from '@/types'

export interface ActionItem {
  id: string
  label: string
  icon: LucideIcon
  run: () => void
  danger?: boolean
  /** Asks before running: the question, and the confirming button's label. */
  confirm?: { title: string; action: string }
}

interface ActionHandlers {
  reply: () => void
  copy: () => void
  edit: () => void
  pin: () => void
  unpin: () => void
  spoiler: (index: number, spoiler: boolean) => void
  remove: () => void
}

const isVisual = (a: Attachment | undefined) => !!a && (a.type === 'image' || a.type === 'video' || a.type === 'gif')

/**
 * A message's actions, in order: Reply · Copy text · Edit (mine, with text) · Pin/Unpin · spoiler · Delete
 * (mine; red; asks first). `mediaIndex` is the photo, video or GIF that was pressed: its spoiler item
 * applies to it. Without one (keyboard, desktop toolbar away from the media) every visual item gets one.
 */
export function buildActions({
  message,
  mine,
  pinned,
  mediaIndex,
  on,
}: {
  message: Message
  mine: boolean
  pinned: boolean
  mediaIndex: number | null
  on: ActionHandlers
}): ActionItem[] {
  const items: ActionItem[] = [{ id: 'reply', label: 'Reply', icon: Reply, run: on.reply }]
  if (message.content) {
    items.push({ id: 'copy', label: 'Copy text', icon: Copy, run: on.copy })
    if (mine) items.push({ id: 'edit', label: 'Edit', icon: Pencil, run: on.edit })
  }
  items.push(
    pinned
      ? { id: 'unpin', label: 'Unpin', icon: PinOff, run: on.unpin }
      : { id: 'pin', label: 'Pin', icon: Pin, run: on.pin },
  )

  const visual = message.attachments.map((a, index) => ({ a, index })).filter(({ a }) => isVisual(a))
  const targets =
    mediaIndex !== null ? (isVisual(message.attachments[mediaIndex]) ? [{ a: message.attachments[mediaIndex], index: mediaIndex }] : []) : visual
  const numbered = targets.length > 1
  for (const { a, index } of targets) {
    const n = index + 1
    items.push(
      a.spoiler
        ? {
            id: `spoiler-${index}`,
            label: numbered ? `Remove spoiler from item ${n}` : 'Remove spoiler',
            icon: Eye,
            run: () => on.spoiler(index, false),
          }
        : {
            id: `spoiler-${index}`,
            label: numbered ? `Mark item ${n} as spoiler` : 'Mark as spoiler',
            icon: EyeOff,
            run: () => on.spoiler(index, true),
          },
    )
  }

  if (mine) {
    items.push({
      id: 'delete',
      label: 'Delete',
      icon: Trash2,
      run: on.remove,
      danger: true,
      confirm: { title: 'Delete this message?', action: 'Delete' },
    })
  }
  return items
}
