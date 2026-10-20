import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { useMessageStore } from '@/stores/messageStore'
import { supabase } from '@/lib/supabase'
import { ReactionPicker, ReactionDisplay } from '@/components/chat/ReactionPicker'
import { MessageContextMenu } from '@/components/chat/MessageContextMenu'
import type { Message, Reaction } from '@/types'

/**
 * INTERIM (redesign 3a, Task 8): the old MessageItem's reaction row, hover toolbar / long-press menu
 * (reply, copy, pin, edit, delete) and inline edit, wrapped around the new Cozy bubble so the existing
 * behaviour keeps working. Task 9 replaces the reactions (and this per-message channel), Task 10 the
 * menus, Task 11 the edit (moved into the composer); then this file goes.
 */
interface LegacyMessageExtrasProps {
  message: Message
  isOwn: boolean
  /** spaceKey(conversationId, space) of the list this message is in. */
  spaceKey: string
  isPinned: boolean
  onBroadcastDelete: (messageId: string) => void
  onPin?: (messageId: string) => void
  onUnpin?: (messageId: string) => void
  onSetReply?: (message: Message) => void
  /** The bubble. Replaced by the inline editor while editing. */
  children: ReactNode
}

export function LegacyMessageExtras({
  message,
  isOwn,
  spaceKey,
  isPinned,
  onBroadcastDelete,
  onPin,
  onUnpin,
  onSetReply,
  children,
}: LegacyMessageExtrasProps) {
  const { user } = useAuthStore()
  const { editMessage, deleteMessage } = useMessageStore()
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(message.content ?? '')
  const [showActions, setShowActions] = useState(false)
  const [showReactionPicker, setShowReactionPicker] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [reactions, setReactions] = useState<Reaction[]>([])
  const [showMobileMenu, setShowMobileMenu] = useState(false)
  const [moreAnchor, setMoreAnchor] = useState<DOMRect | null>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (longPressTimer.current) clearTimeout(longPressTimer.current)
    }
  }, [])

  const handleTouchStart = () => {
    longPressTimer.current = setTimeout(() => {
      navigator.vibrate?.(10)
      setShowMobileMenu(true)
    }, 500)
  }

  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  // Reactions: fetched and subscribed per message (Task 9 moves them onto the conversation channel).
  useEffect(() => {
    supabase
      .from('reactions')
      .select('*')
      .eq('message_id', message.id)
      .then(({ data }) => {
        if (data) setReactions(data as Reaction[])
      })

    const channel = supabase
      .channel(`reactions:${message.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reactions', filter: `message_id=eq.${message.id}` },
        (payload) => {
          setReactions((prev) => {
            const r = payload.new as Reaction
            return prev.some((x) => x.id === r.id) ? prev : [...prev, r]
          })
        })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'reactions', filter: `message_id=eq.${message.id}` },
        (payload) => {
          setReactions((prev) => prev.filter((r) => r.id !== (payload.old as Reaction).id))
        })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [message.id])

  const handleAddReaction = async (emoji: string) => {
    if (!user) return
    const optimistic: Reaction = {
      id: `optimistic-${Date.now()}`,
      message_id: message.id,
      user_id: user.id,
      emoji,
      created_at: new Date().toISOString(),
    }
    setReactions((prev) => [...prev, optimistic])
    const { data } = await supabase
      .from('reactions')
      .insert({ message_id: message.id, user_id: user.id, emoji })
      .select()
      .single()
    if (data) {
      setReactions((prev) => prev.map((r) => r.id === optimistic.id ? data as Reaction : r))
    } else {
      setReactions((prev) => prev.filter((r) => r.id !== optimistic.id))
    }
  }

  const handleRemoveReaction = async (emoji: string) => {
    if (!user) return
    setReactions((prev) => prev.filter((r) => !(r.user_id === user.id && r.emoji === emoji)))
    await supabase
      .from('reactions')
      .delete()
      .eq('message_id', message.id)
      .eq('user_id', user.id)
      .eq('emoji', emoji)
  }

  const handleCopy = () => {
    if (message.content) navigator.clipboard.writeText(message.content).catch(() => {})
  }

  const handlePin = () => {
    if (isPinned) onUnpin?.(message.id)
    else onPin?.(message.id)
  }

  const handleEdit = async () => {
    if (!editContent.trim() || editContent === message.content) {
      setIsEditing(false)
      return
    }
    await editMessage(message.id, editContent, spaceKey)
    setIsEditing(false)
  }

  const handleDelete = async () => {
    await deleteMessage(message.id, spaceKey)
    onBroadcastDelete(message.id)
    setShowDeleteConfirm(false)
  }

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleEdit()
    }
    if (e.key === 'Escape') {
      setIsEditing(false)
      setEditContent(message.content ?? '')
    }
  }

  const sharedContextMenuProps = {
    message,
    author: null,
    isOwn,
    isPinned,
    onCopy: handleCopy,
    onReply: () => onSetReply?.(message),
    onPin: handlePin,
    onAddReaction: handleAddReaction,
    onEdit: () => { setEditContent(message.content ?? ''); setIsEditing(true); setShowMobileMenu(false); setMoreAnchor(null) },
    onDelete: () => { setShowDeleteConfirm(true); setShowActions(true); setShowMobileMenu(false); setMoreAnchor(null) },
  }

  return (
    <div
      className={`group relative flex w-full flex-col ${isOwn ? 'items-end' : 'items-start'}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => { setShowActions(false); setShowDeleteConfirm(false) }}
      onTouchStart={handleTouchStart}
      onTouchEnd={cancelLongPress}
      onTouchMove={cancelLongPress}
      onContextMenu={(e) => e.preventDefault()}
    >
      {isEditing ? (
        <div className="w-full max-w-[var(--bubble-max,78%)]">
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            onKeyDown={handleEditKeyDown}
            aria-label="Edit message"
            className="w-full resize-none rounded-[10px] bg-input p-2 text-[15px] text-primary outline-none"
            rows={Math.min(editContent.split('\n').length + 1, 6)}
            autoFocus
          />
          <p className="mt-1 text-xs text-muted">
            escape to <button onClick={() => setIsEditing(false)} className="text-link hover:underline">cancel</button>
            {' '}&middot; enter to <button onClick={() => void handleEdit()} className="text-link hover:underline">save</button>
          </p>
        </div>
      ) : (
        children
      )}

      <div className={`flex max-w-[var(--bubble-max,78%)] ${isOwn ? 'justify-end' : ''}`}>
        <ReactionDisplay reactions={reactions} messageId={message.id} onAdd={handleAddReaction} onRemove={handleRemoveReaction} />
      </div>

      {/* Message actions (desktop hover) */}
      {showActions && !isEditing && (
        <div className="absolute -top-3 right-2 z-10 flex rounded border border-[color:var(--line)] bg-[color:var(--bar)] shadow-sm">
          <div className="relative">
            <button
              onClick={() => setShowReactionPicker(!showReactionPicker)}
              className="p-1.5 text-interactive transition-colors hover:text-interactive-hover"
              title="Add Reaction"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                <line x1="9" y1="9" x2="9.01" y2="9" />
                <line x1="15" y1="9" x2="15.01" y2="9" />
              </svg>
            </button>
            {showReactionPicker && (
              <div className="absolute right-0 top-full z-50 mt-1">
                <ReactionPicker messageId={message.id} onAdd={handleAddReaction} onClose={() => setShowReactionPicker(false)} />
              </div>
            )}
          </div>

          {isOwn && (showDeleteConfirm ? (
            <div className="flex items-center gap-1 px-1.5">
              <span className="text-xs font-medium text-danger">Delete?</span>
              <button
                onClick={() => void handleDelete()}
                className="rounded bg-danger px-1.5 py-0.5 text-xs font-medium text-on-danger transition-opacity hover:opacity-90"
              >
                Yes
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="rounded px-1.5 py-0.5 text-xs font-medium text-interactive transition-colors hover:text-interactive-hover"
              >
                No
              </button>
            </div>
          ) : (
            <>
              <button
                onClick={() => { setEditContent(message.content ?? ''); setIsEditing(true) }}
                className="p-1.5 text-interactive transition-colors hover:text-interactive-hover"
                title="Edit"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="p-1.5 text-interactive transition-colors hover:text-danger"
                title="Delete"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </>
          ))}

          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation()
                setMoreAnchor(moreAnchor ? null : (e.currentTarget as HTMLElement).getBoundingClientRect())
              }}
              className="p-1.5 text-interactive transition-colors hover:text-interactive-hover"
              title="More actions"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="1" />
                <circle cx="19" cy="12" r="1" />
                <circle cx="5" cy="12" r="1" />
              </svg>
            </button>
            {moreAnchor && (
              <MessageContextMenu {...sharedContextMenuProps} anchorRect={moreAnchor} onClose={() => setMoreAnchor(null)} />
            )}
          </div>
        </div>
      )}

      {/* Mobile context menu: bottom sheet */}
      {showMobileMenu && <MessageContextMenu {...sharedContextMenuProps} onClose={() => setShowMobileMenu(false)} />}
    </div>
  )
}
