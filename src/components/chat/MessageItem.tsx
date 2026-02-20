import { useState, useEffect } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { useMessageStore } from '@/stores/messageStore'
import { supabase } from '@/lib/supabase'
import { MarkdownRenderer } from '@/components/chat/MarkdownRenderer'
import { ReactionPicker, ReactionDisplay } from '@/components/chat/ReactionPicker'
import type { Message, Profile, Reaction } from '@/types'

interface MessageItemProps {
  message: Message
  author: Profile | null
  showHeader: boolean // Whether to show avatar + name (false for consecutive messages from same author)
  channelId: string
  onBroadcastEdit: (message: Message) => void
  onBroadcastDelete: (messageId: string) => void
}

export function MessageItem({ message, author, showHeader, channelId, onBroadcastEdit, onBroadcastDelete }: MessageItemProps) {
  const { user } = useAuthStore()
  const { editMessage, deleteMessage } = useMessageStore()
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(message.content ?? '')
  const [showActions, setShowActions] = useState(false)
  const [showReactionPicker, setShowReactionPicker] = useState(false)
  const [reactions, setReactions] = useState<Reaction[]>([])

  // Fetch reactions for this message
  useEffect(() => {
    supabase
      .from('reactions')
      .select('*')
      .eq('message_id', message.id)
      .then(({ data }) => {
        if (data) setReactions(data as Reaction[])
      })
  }, [message.id])

  const isOwn = user?.id === message.author_id
  const timestamp = new Date(message.created_at)
  const editedAt = message.edited_at ? new Date(message.edited_at) : null

  const handleEdit = async () => {
    if (!editContent.trim() || editContent === message.content) {
      setIsEditing(false)
      return
    }
    await editMessage(message.id, editContent, channelId)
    setIsEditing(false)
    // Broadcast will be handled by the caller if needed
  }

  const handleDelete = async () => {
    await deleteMessage(message.id, channelId)
    onBroadcastDelete(message.id)
  }

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleEdit()
    }
    if (e.key === 'Escape') {
      setIsEditing(false)
      setEditContent(message.content ?? '')
    }
  }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const formatDate = (date: Date) => {
    const today = new Date()
    if (date.toDateString() === today.toDateString()) {
      return `Today at ${formatTime(date)}`
    }
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    if (date.toDateString() === yesterday.toDateString()) {
      return `Yesterday at ${formatTime(date)}`
    }
    return `${date.toLocaleDateString()} ${formatTime(date)}`
  }

  return (
    <div
      className={`group relative flex gap-4 px-5 py-0.5 hover:bg-hover ${showHeader ? 'mt-[17px]' : ''}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Avatar or timestamp gutter */}
      <div className="w-10 flex-shrink-0">
        {showHeader ? (
          author?.avatar_url ? (
            <img
              src={author.avatar_url}
              alt={author.nickname}
              className="mt-0.5 h-10 w-10 rounded-full object-cover"
            />
          ) : (
            <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-full bg-brand text-sm font-semibold text-white">
              {author?.nickname?.charAt(0).toUpperCase() ?? '?'}
            </div>
          )
        ) : (
          <span className="hidden text-[11px] text-muted group-hover:inline leading-[22px]">
            {formatTime(timestamp)}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        {showHeader && (
          <div className="flex items-baseline gap-2">
            <span className="font-medium text-primary hover:underline cursor-pointer">
              {author?.nickname ?? 'Unknown'}
            </span>
            <span className="text-xs text-muted">{formatDate(timestamp)}</span>
          </div>
        )}

        {isEditing ? (
          <div className="mt-1">
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onKeyDown={handleEditKeyDown}
              className="w-full resize-none rounded bg-input p-2 text-sm text-primary outline-none"
              rows={Math.min(editContent.split('\n').length + 1, 6)}
              autoFocus
            />
            <p className="mt-1 text-xs text-muted">
              escape to <button onClick={() => setIsEditing(false)} className="text-link hover:underline">cancel</button>
              {' '}&middot; enter to <button onClick={handleEdit} className="text-link hover:underline">save</button>
            </p>
          </div>
        ) : (
          <div className="text-[15px] leading-[22px] text-secondary">
            {message.content && <MarkdownRenderer content={message.content} />}
            {editedAt && (
              <span className="ml-1 text-[10px] text-muted" title={formatDate(editedAt)}>
                (edited)
              </span>
            )}
          </div>
        )}

        {/* Attachments */}
        {message.attachments.length > 0 && (
          <div className="mt-1 space-y-1">
            {message.attachments.map((attachment, i) => (
              <MediaEmbed key={i} attachment={attachment} />
            ))}
          </div>
        )}

        {/* Reactions */}
        <ReactionDisplay reactions={reactions} messageId={message.id} />
      </div>

      {/* Message actions (hover) */}
      {showActions && !isEditing && (
        <div className="absolute -top-3 right-4 flex rounded border border-[hsl(var(--color-bg-tertiary))] bg-primary shadow-sm">
          {/* Reaction button */}
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
                <ReactionPicker messageId={message.id} onClose={() => setShowReactionPicker(false)} />
              </div>
            )}
          </div>
          {isOwn && (
            <>
              <button
                onClick={() => setIsEditing(true)}
                className="p-1.5 text-interactive transition-colors hover:text-interactive-hover"
                title="Edit"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
              <button
                onClick={handleDelete}
                className="p-1.5 text-interactive transition-colors hover:text-danger"
                title="Delete"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// Inline media embed for attachments
function MediaEmbed({ attachment }: { attachment: Message['attachments'][number] }) {
  const [spoilerRevealed, setSpoilerRevealed] = useState(!attachment.spoiler)

  if (attachment.type === 'image' || attachment.type === 'gif') {
    return (
      <div
        className="relative inline-block max-w-md cursor-pointer overflow-hidden rounded"
        onClick={() => !spoilerRevealed && setSpoilerRevealed(true)}
      >
        <img
          src={attachment.url}
          alt={attachment.filename}
          className={`max-h-[300px] rounded object-contain ${!spoilerRevealed ? 'blur-xl' : ''}`}
          loading="lazy"
        />
        {!spoilerRevealed && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="rounded bg-black/60 px-3 py-1 text-sm font-semibold text-white">
              SPOILER
            </span>
          </div>
        )}
      </div>
    )
  }

  if (attachment.type === 'video') {
    return (
      <div className="relative inline-block max-w-lg overflow-hidden rounded">
        {!spoilerRevealed ? (
          <div
            className="flex h-48 w-80 cursor-pointer items-center justify-center rounded bg-tertiary"
            onClick={() => setSpoilerRevealed(true)}
          >
            <span className="rounded bg-black/60 px-3 py-1 text-sm font-semibold text-white">
              SPOILER
            </span>
          </div>
        ) : (
          <video
            src={attachment.url}
            controls
            className="max-h-[300px] rounded"
          />
        )}
      </div>
    )
  }

  // Generic file
  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 rounded border border-[hsl(var(--color-input-border))] bg-secondary p-3 hover:bg-hover"
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-interactive">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
      <div>
        <p className="text-sm text-link hover:underline">{attachment.filename}</p>
        <p className="text-xs text-muted">{formatFileSize(attachment.size)}</p>
      </div>
    </a>
  )
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
