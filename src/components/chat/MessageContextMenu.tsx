import { Portal } from '@/components/ui/Portal'
import type { Message, Profile } from '@/types'

interface MessageContextMenuProps {
  message: Message
  author: Profile | null
  isOwn: boolean
  isPinned: boolean
  /** Present → render as floating dropdown; absent → render as bottom sheet */
  anchorRect?: DOMRect
  onClose: () => void
  onCopy: () => void
  onReply: () => void
  onPin: () => void
  onAddReaction: (emoji: string) => void
  onEdit: () => void
  onDelete: () => void
}

const QUICK_REACTIONS = ['❤️', '😂', '💕', '⭐', '😢', '😡', '👍', '😮']

export function MessageContextMenu({
  message,
  isOwn,
  isPinned,
  anchorRect,
  onClose,
  onCopy,
  onReply,
  onPin,
  onAddReaction,
  onEdit,
  onDelete,
}: MessageContextMenuProps) {
  const actions: { label: string; icon: React.ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean }[] = [
    {
      label: 'Reply',
      icon: <ReplyIcon />,
      onClick: () => { onReply(); onClose() },
    },
    {
      label: 'Copy Text',
      icon: <CopyIcon />,
      onClick: () => { onCopy(); onClose() },
      disabled: !message.content,
    },
    {
      label: isPinned ? 'Unpin Message' : 'Pin Message',
      icon: <PinIcon />,
      onClick: () => { onPin(); onClose() },
    },
    ...(isOwn
      ? [
          {
            label: 'Edit Message',
            icon: <EditIcon />,
            onClick: () => { onEdit(); onClose() },
          },
          {
            label: 'Delete Message',
            icon: <DeleteIcon />,
            onClick: () => { onDelete(); onClose() },
            danger: true,
          },
        ]
      : []),
  ]

  if (anchorRect) {
    // Desktop: floating dropdown anchored below the button
    const top = Math.min(anchorRect.bottom + 4, window.innerHeight - 220)
    const right = window.innerWidth - anchorRect.right

    return (
      <Portal>
        <div className="fixed inset-0 z-40" onClick={onClose} />
        <div
          className="fixed z-50 min-w-[180px] rounded-md bg-floating p-1 shadow-lg"
          style={{ top, right }}
        >
          {actions
            .filter((a) => !a.disabled)
            .map((action) => (
              <button
                key={action.label}
                onClick={action.onClick}
                className={`flex w-full items-center gap-2.5 rounded-[3px] px-3 py-1.5 text-left text-sm transition-colors ${
                  action.danger
                    ? 'text-danger hover:bg-danger hover:text-white'
                    : 'text-interactive hover:bg-hover hover:text-interactive-hover'
                }`}
              >
                <span className="w-4 flex-shrink-0">{action.icon}</span>
                {action.label}
              </button>
            ))}
        </div>
      </Portal>
    )
  }

  // Mobile: bottom sheet
  return (
    <Portal>
      <div className="fixed inset-0 z-50 bg-black/60" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl bg-floating pb-safe shadow-xl">
        {/* Quick reactions */}
        <div className="flex items-center justify-around px-2 py-4">
          {QUICK_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => { onAddReaction(emoji); onClose() }}
              className="flex h-12 w-12 items-center justify-center rounded-full text-2xl transition-transform hover:scale-110 active:scale-90"
            >
              {emoji}
            </button>
          ))}
        </div>
        <div className="mx-4 border-t border-[hsl(var(--color-bg-tertiary))]" />
        {/* Actions */}
        <div className="py-2">
          {actions.map((action, i) => (
            <button
              key={action.label}
              onClick={action.disabled ? undefined : action.onClick}
              disabled={action.disabled}
              className={`flex w-full items-center gap-4 px-5 py-3.5 text-[15px] transition-colors ${
                action.danger ? 'text-danger' : 'text-primary'
              } ${action.disabled ? 'opacity-40' : 'hover:bg-hover active:bg-active'}`}
            >
              <span className={`flex-shrink-0 ${action.danger ? 'text-danger' : 'text-interactive'}`}>
                {action.icon}
              </span>
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </Portal>
  )
}

function ReplyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 17 4 12 9 7" />
      <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
    </svg>
  )
}

function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function PinIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="17" x2="12" y2="22" />
      <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
    </svg>
  )
}

function EditIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  )
}

function DeleteIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  )
}
