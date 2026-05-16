import { useState, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { useMessageStore } from '@/stores/messageStore'
import { useChannelStore } from '@/stores/channelStore'
import { useUiStore } from '@/stores/uiStore'
import { useTyping } from '@/hooks/useTyping'
import { uploadFile, getFileType } from '@/lib/bunny'
import { EmojiPicker } from '@/components/chat/EmojiPicker'
import { GifPicker } from '@/components/chat/GifPicker'
import type { Channel, Attachment, Message } from '@/types'
import type { TenorGif } from '@/lib/tenor'

interface MessageInputProps {
  channel: Channel
  replyTo?: Message | null
  onCancelReply?: () => void
}

export function MessageInput({ channel, replyTo, onCancelReply }: MessageInputProps) {
  const { user } = useAuthStore()
  const { getOrCreateSession, dragTheLake } = useChannelStore()
  const { setEepMode } = useUiStore()
  const { sendTyping } = useTyping(channel.id)
  const [content, setContent] = useState('')
  const [showEmoji, setShowEmoji] = useState(false)
  const [showGif, setShowGif] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const gifButtonRef = useRef<HTMLButtonElement>(null)

  const handleSend = useCallback(async () => {
    const trimmed = content.trim()
    if ((!trimmed && pendingAttachments.length === 0) || !user) return

    // Handle slash commands
    if (trimmed.startsWith('/') && pendingAttachments.length === 0) {
      const command = trimmed.toLowerCase()
      if (command === '/drag') {
        dragTheLake(channel.id)
        setContent('')
        return
      }
      if (command === '/eep') {
        setEepMode(true)
        setContent('')
        return
      }
    }

    // Get existing session or create one if channel has none yet
    const session = await getOrCreateSession(channel.id)
    if (!session) return

    const attachmentsToSend = pendingAttachments
    setContent('')
    setPendingAttachments([])
    onCancelReply?.()

    // Send the message with attachments
    const { data, error } = await supabase
      .from('messages')
      .insert({
        channel_id: channel.id,
        session_id: session.id,
        author_id: user.id,
        content: trimmed || null,
        attachments: attachmentsToSend,
        type: 'text',
      })
      .select()
      .single()

    if (!error && data) {
      useMessageStore.getState().addMessage(channel.id, data)
    }

    // Re-focus input
    textareaRef.current?.focus()
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [content, pendingAttachments, user, channel.id, getOrCreateSession, dragTheLake, setEepMode])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value)
    sendTyping()

    // Auto-resize textarea
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
    }
  }

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploading(true)

    for (const file of Array.from(files)) {
      try {
        const result = await uploadFile(file, `messages/${channel.id}`)
        const attachment: Attachment = {
          url: result.url,
          type: getFileType(result.type),
          filename: result.filename,
          size: result.size,
          spoiler: false,
        }
        setPendingAttachments((prev) => [...prev, attachment])
      } catch {
        // Failed silently
      }
    }

    setUploading(false)
  }

  const handleGifSelect = async (gif: TenorGif) => {
    if (!user) return

    const session = await getOrCreateSession(channel.id)
    if (!session) return

    // Send GIF as a message immediately
    const { data, error } = await supabase
      .from('messages')
      .insert({
        channel_id: channel.id,
        session_id: session.id,
        author_id: user.id,
        content: null,
        attachments: [{
          url: gif.url,
          type: 'gif' as const,
          filename: gif.title || 'gif',
          size: 0,
          spoiler: false,
        }],
        type: 'gif',
      })
      .select()
      .single()

    if (!error && data) {
      useMessageStore.getState().addMessage(channel.id, data)
    }
  }

  const handleEmojiSelect = (emoji: string) => {
    setContent((prev) => prev + emoji)
    setShowEmoji(false)
    textareaRef.current?.focus()
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return

    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (file) {
          handleFileUpload(createFileList(file))
        }
      }
    }
  }

  const toggleSpoiler = (index: number) => {
    setPendingAttachments((prev) =>
      prev.map((a, i) => (i === index ? { ...a, spoiler: !a.spoiler } : a))
    )
  }

  const removeAttachment = (index: number) => {
    setPendingAttachments((prev) => prev.filter((_, i) => i !== index))
  }

  // Handle drag and drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    handleFileUpload(e.dataTransfer.files)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  return (
    <div
      className="relative flex-shrink-0 px-5 pb-6"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {/* Reply bar */}
      {replyTo && (
        <div className="mb-1 flex items-center gap-2 rounded-t-lg bg-input px-4 py-2 text-xs text-muted">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-brand">
            <polyline points="9 17 4 12 9 7" />
            <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
          </svg>
          <span className="flex-1 truncate">
            Replying to{' '}
            <span className="font-medium text-primary">{replyTo.content?.slice(0, 60) ?? 'attachment'}</span>
          </span>
          <button
            onClick={onCancelReply}
            className="flex-shrink-0 text-muted transition-colors hover:text-interactive-hover"
            title="Cancel reply"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}
      <div className={`rounded-lg bg-input ${pendingAttachments.length > 0 ? 'pt-3' : ''}`}>
        {/* Pending attachments preview */}
        {pendingAttachments.length > 0 && (
          <div className="flex flex-wrap gap-2 border-b border-[hsl(var(--color-input-border))] px-4 pb-3">
            {pendingAttachments.map((att, i) => (
              <div key={i} className="relative rounded border border-[hsl(var(--color-input-border))] bg-secondary p-2">
                {(att.type === 'image' || att.type === 'gif') ? (
                  <img src={att.url} alt={att.filename} className="h-24 w-24 rounded object-cover" />
                ) : (
                  <div className="flex h-24 w-24 items-center justify-center break-all text-center text-xs text-muted">
                    {att.filename}
                  </div>
                )}
                <div className="mt-1 flex gap-1">
                  <button
                    onClick={() => toggleSpoiler(i)}
                    className={`rounded px-1 text-[10px] ${att.spoiler ? 'bg-brand text-white' : 'bg-hover text-muted'}`}
                  >
                    SPOILER
                  </button>
                  <button
                    onClick={() => removeAttachment(i)}
                    className="rounded bg-hover px-1 text-[10px] text-danger"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 px-4 py-1">
        {/* File upload button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex-shrink-0 rounded p-1 text-interactive transition-colors hover:text-interactive-hover disabled:opacity-50"
          title="Upload a file"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="16" />
            <line x1="8" y1="12" x2="16" y2="12" />
          </svg>
        </button>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={(e) => handleFileUpload(e.target.files)}
          className="hidden"
          accept="image/*,video/*,.pdf,.txt"
        />

        {/* Text input */}
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={uploading ? 'Uploading...' : `Message #${channel.name}`}
          className="max-h-[200px] min-h-[24px] flex-1 resize-none bg-transparent py-2.5 text-[15px] text-primary outline-none placeholder:text-muted"
          rows={1}
          autoComplete="off"
          autoCorrect="off"
          spellCheck
          enterKeyHint="send"
        />

        {/* GIF button — hidden on mobile when there's content to keep layout clean */}
        <button
          ref={gifButtonRef}
          onClick={() => { setShowGif(!showGif); setShowEmoji(false) }}
          className={`flex-shrink-0 rounded p-1 text-interactive transition-colors hover:text-interactive-hover ${content.trim() ? 'hidden sm:block' : ''}`}
          title="Search GIFs"
        >
          <span className="text-xs font-bold">GIF</span>
        </button>
        {showGif && (
          <GifPicker
            anchorRef={gifButtonRef}
            onSelect={handleGifSelect}
            onClose={() => setShowGif(false)}
          />
        )}

        {/* Emoji button */}
        <div className="relative">
          <button
            onClick={() => { setShowEmoji(!showEmoji); setShowGif(false) }}
            className="flex-shrink-0 rounded p-1 text-interactive transition-colors hover:text-interactive-hover"
            title="Pick an emoji"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M8 14s1.5 2 4 2 4-2 4-2" />
              <line x1="9" y1="9" x2="9.01" y2="9" />
              <line x1="15" y1="9" x2="15.01" y2="9" />
            </svg>
          </button>
          {showEmoji && (
            <EmojiPicker
              onSelect={handleEmojiSelect}
              onClose={() => setShowEmoji(false)}
            />
          )}
        </div>

        {/* Send button — visible on mobile when there's content to send */}
        {(content.trim() || pendingAttachments.length > 0) && (
          <button
            onClick={handleSend}
            className="flex-shrink-0 sm:hidden flex h-8 w-8 items-center justify-center rounded-full bg-brand transition-colors hover:bg-brand-hover"
            title="Send"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-white translate-x-px">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        )}
        </div>
      </div>
    </div>
  )
}

// Helper to create a FileList-like object from a single File
function createFileList(file: File): FileList {
  const dt = new DataTransfer()
  dt.items.add(file)
  return dt.files
}
