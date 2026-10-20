import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Check, Paperclip, Pencil, Reply, SendHorizontal, Smile, X, type LucideIcon } from 'lucide-react'
import { Icon } from '@/components/ui/Icon'
import { EmojiPicker } from '@/components/emoji/EmojiPicker'
import { GifPicker } from '@/components/chat/GifPicker'
import { PendingAttachments } from '@/components/chat2/PendingAttachments'
import { useTyping } from '@/hooks/useTyping'
import { messagePreview } from '@/lib/chat/preview'
import { sendOutgoing } from '@/lib/chat/outbox'
import { sendMessageEvent } from '@/lib/conversationRealtime'
import { discardUpload, retryUpload, startUpload } from '@/lib/chat/uploads'
import { SPACE_LABEL, spaceKey } from '@/lib/spaces'
import { useAuthStore } from '@/stores/authStore'
import { useComposerStore } from '@/stores/composerStore'
import { useConversationStore } from '@/stores/conversationStore'
import { toAttachment, useDraftStore, type PendingAttachment } from '@/stores/draftStore'
import { useMessageStore } from '@/stores/messageStore'
import { useProfileStore } from '@/stores/profileStore'
import { useUiStore } from '@/stores/uiStore'
import type { Attachment, Message, Space } from '@/types'
import type { TenorGif } from '@/lib/tenor'

interface ComposerProps {
  conversationId: string
  space: Space
  /** Desktop: Enter sends, Shift+Enter is a newline. Phones: Return is always a newline; the button sends. */
  isDesktop: boolean
  replyTo?: Message | null
  onCancelReply?: () => void
}

const NO_ATTACHMENTS: PendingAttachment[] = []
/** 6 lines of 20 px plus the 8 px top and bottom padding; then it scrolls. */
const MAX_HEIGHT = 6 * 20 + 16

/**
 * The message box. Built for iOS typing: autocorrect, predictive text and IME composition are never
 * disturbed (the value is only ever what was typed, and nothing acts on Enter or resizes mid-composition).
 * It also edits my messages (composerStore.editing) under an "Editing message" bar.
 */
export function Composer({ conversationId, space, isDesktop, replyTo = null, onCancelReply }: ComposerProps) {
  const userId = useAuthStore((s) => s.user?.id)
  const dragTheLake = useConversationStore((s) => s.dragTheLake)
  const setEepMode = useUiStore((s) => s.setEepMode)
  const { sendTyping, stopTyping } = useTyping(space)
  const key = spaceKey(conversationId, space)

  const [content, setContent] = useState(() => useDraftStore.getState().drafts[key]?.content ?? '')
  const attachments = useDraftStore((s) => s.drafts[key]?.attachments ?? NO_ATTACHMENTS)
  useEffect(() => {
    useDraftStore.getState().setContent(key, content)
  }, [key, content])

  // Editing one of my messages in this space: its text replaces the draft in the field until saved or cancelled.
  const editingAny = useComposerStore((s) => s.editing)
  const editing = editingAny && editingAny.conversation_id === conversationId && editingAny.space === space ? editingAny : null
  const [editFor, setEditFor] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  if ((editing?.id ?? null) !== editFor) {
    setEditFor(editing?.id ?? null)
    setEditText(editing?.content ?? '')
  }

  const replyAuthor = useProfileStore((s) => (replyTo ? (s.profiles[replyTo.author_id]?.nickname ?? null) : null))

  const [showEmoji, setShowEmoji] = useState(false)
  const [showGif, setShowGif] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const gifButtonRef = useRef<HTMLButtonElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const emojiButtonRef = useRef<HTMLButtonElement>(null)
  /**
   * Where emoji go: the field's selection, kept up to date on select, keyup and blur (and moved past each
   * insert), because on a phone the field isn't focused while the picker is open.
   */
  const caretRef = useRef<{ start: number; end: number } | null>(null)
  /** The caret to restore once an insert has rendered. */
  const pendingCaretRef = useRef<number | null>(null)
  /** Phones: the picker takes the keyboard's place under the composer, and the field stays unfocused. */
  const phonePicker = showEmoji && !isDesktop

  // IME composition (and iOS predictive text): Safari fires compositionend *before* the keydown of the
  // Enter that committed it, so an Enter in the same tick as a compositionend still belongs to it.
  const composingRef = useRef(false)
  const justComposedRef = useRef(false)
  const rafRef = useRef(0)

  const value = editing ? editText : content
  const uploading = attachments.some((a) => a.status === 'uploading')
  const ready = attachments.map(toAttachment).filter((a): a is Attachment => a !== null)
  const canSubmit = editing ? true : !uploading && (content.trim() !== '' || ready.length > 0)

  /** Grows with the text up to 6 lines (in a frame, never mid-composition). */
  const resize = useCallback(() => {
    if (composingRef.current) return
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      el.style.height = 'auto'
      el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`
    })
  }, [])
  useEffect(() => resize(), [value, resize])
  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  // After an emoji insert: the caret goes after it. Desktop focuses the field; phones leave it unfocused,
  // so the keyboard stays down while picking.
  useLayoutEffect(() => {
    const at = pendingCaretRef.current
    const el = textareaRef.current
    if (at === null || !el) return
    pendingCaretRef.current = null
    if (isDesktop) el.focus()
    el.setSelectionRange(at, at)
  }, [value, isDesktop])

  const rememberCaret = () => {
    const el = textareaRef.current
    if (el) caretRef.current = { start: el.selectionStart, end: el.selectionEnd }
  }

  // Starting an edit puts the caret at the end of the message.
  useEffect(() => {
    if (!editFor) return
    const el = textareaRef.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [editFor])

  const cancelEdit = () => useComposerStore.getState().cancelEdit()

  const saveEdit = async () => {
    if (!editing) return
    const text = editText
    const target = editing
    cancelEdit()
    if (text.trim() && text !== target.content) {
      const saved = await useMessageStore.getState().editMessage(target.id, text, key)
      // Like new messages and deletes, an edit is broadcast too; its database change is the safety net.
      if (saved) sendMessageEvent('edit', saved)
    }
    caretRef.current = null
    if (!phonePicker) textareaRef.current?.focus()
  }

  const send = () => {
    const trimmed = content.trim()
    if (!userId || uploading || (!trimmed && ready.length === 0)) return
    stopTyping()

    if (trimmed.startsWith('/') && ready.length === 0) {
      const command = trimmed.toLowerCase()
      if (command === '/drag') {
        void dragTheLake()
        setContent('')
        return
      }
      if (command === '/eep') {
        setEepMode(true)
        setContent('')
        return
      }
    }

    setContent('')
    // Sent files leave the tray; a failed one stays there with Retry.
    for (const a of attachments) if (a.status === 'done') discardUpload(key, a.id)
    onCancelReply?.()
    // Shows at once (clock tick); a failed send stays in the list with Retry.
    void sendOutgoing({
      authorId: userId,
      space,
      content: trimmed || null,
      attachments: ready,
      type: 'text',
      replyTo: replyTo?.id ?? null,
    })
    caretRef.current = null
    // Phones with the picker open: keep the keyboard down (focusing would swap the picker for it).
    if (!phonePicker) textareaRef.current?.focus()
  }

  const submit = () => {
    if (editing) void saveEdit()
    else send()
  }

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value
    caretRef.current = { start: e.target.selectionStart, end: e.target.selectionEnd }
    if (editing) {
      setEditText(next)
      return
    }
    setContent(next)
    // Clearing the box counts as stopping; anything else is typing.
    if (next.trim()) sendTyping()
    else stopTyping()
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      // The emoji picker took this one (it closes first).
      if (e.defaultPrevented) return
      if (editing) {
        e.preventDefault()
        cancelEdit()
      }
      return
    }
    if (e.key !== 'Enter') return
    if (e.nativeEvent.isComposing || e.keyCode === 229 || composingRef.current || justComposedRef.current) return
    if (!isDesktop || e.shiftKey) return // a newline
    e.preventDefault()
    submit()
  }

  const onCompositionStart = () => {
    composingRef.current = true
  }
  const onCompositionEnd = () => {
    composingRef.current = false
    justComposedRef.current = true
    setTimeout(() => {
      justComposedRef.current = false
    }, 0)
    resize()
  }

  const addFiles = (files: FileList | File[] | null) => {
    for (const file of Array.from(files ?? [])) startUpload(key, conversationId, file)
  }

  const onPaste = (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData?.items ?? [])
      .filter((item) => item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((f): f is File => f !== null)
    if (files.length === 0) return
    e.preventDefault()
    addFiles(files)
  }

  const onGif = (gif: TenorGif) => {
    if (!userId) return
    setShowGif(false)
    onCancelReply?.()
    void sendOutgoing({
      authorId: userId,
      space,
      content: null,
      attachments: [{ url: gif.url, type: 'gif', filename: gif.title || 'gif', size: 0, spoiler: false }],
      type: 'gif',
      replyTo: replyTo?.id ?? null,
    })
  }

  /** Inserts at the caret (replacing a selection); the picker stays open to pick several. */
  const onEmoji = (emoji: string) => {
    const current = value
    const sel = caretRef.current ?? { start: current.length, end: current.length }
    const start = Math.min(sel.start, current.length)
    const end = Math.min(Math.max(sel.end, start), current.length)
    const next = current.slice(0, start) + emoji + current.slice(end)
    const at = start + emoji.length
    caretRef.current = { start: at, end: at }
    pendingCaretRef.current = at
    if (editing) setEditText(next)
    else {
      setContent(next)
      sendTyping()
    }
  }

  const toggleEmoji = () => {
    setShowGif(false)
    if (showEmoji) {
      setShowEmoji(false)
      // Phones: back to the keyboard.
      if (!isDesktop) textareaRef.current?.focus()
      return
    }
    rememberCaret()
    // Phones: the keyboard goes down and the picker takes its place.
    if (!isDesktop) textareaRef.current?.blur()
    setShowEmoji(true)
  }
  const closeEmoji = useCallback(() => setShowEmoji(false), [])

  const toggleSpoiler = (id: string) => {
    const item = attachments.find((a) => a.id === id)
    if (item) useDraftStore.getState().patchAttachment(key, id, { spoiler: !item.spoiler })
  }

  return (
    <>
      <div
        ref={rootRef}
        data-composer
        className="relative flex-shrink-0 border-t border-[color:var(--line)] bg-[color:var(--bar)] pt-2"
        style={
          isDesktop
            ? { paddingLeft: '8%', paddingRight: '8%', paddingBottom: '10px' }
            : {
                paddingLeft: 'max(10px, env(safe-area-inset-left))',
                paddingRight: 'max(10px, env(safe-area-inset-right))',
                // The picker under it handles the home-indicator inset.
                paddingBottom: phonePicker ? '8px' : 'max(8px, env(safe-area-inset-bottom))',
              }
        }
        onDrop={(e) => {
          e.preventDefault()
          addFiles(e.dataTransfer.files)
        }}
        onDragOver={(e) => e.preventDefault()}
      >
        {editing ? (
          <ContextBar icon={Pencil} title="Editing message" snippet={messagePreview(editing)} cancelLabel="Cancel edit" onCancel={cancelEdit} />
        ) : replyTo ? (
          <ContextBar
            icon={Reply}
            title="Replying to"
            name={replyAuthor}
            snippet={messagePreview(replyTo)}
            cancelLabel="Cancel reply"
            onCancel={() => onCancelReply?.()}
          />
        ) : null}

        {!editing && (
          <PendingAttachments
            items={attachments}
            onRemove={(id) => discardUpload(key, id)}
            onRetry={(id) => retryUpload(key, conversationId, id)}
            onToggleSpoiler={toggleSpoiler}
          />
        )}

        <div className="flex items-end gap-2">
          <div className="relative flex min-h-[38px] min-w-0 flex-1 items-end gap-1 rounded-[19px] border border-[color:var(--line)] bg-[color:var(--field)] px-1.5">
            <FieldButton buttonRef={emojiButtonRef} label="Pick an emoji" pressed={showEmoji} onClick={toggleEmoji}>
              <Icon icon={Smile} />
            </FieldButton>

            <textarea
              ref={textareaRef}
              value={value}
              onChange={onChange}
              onKeyDown={onKeyDown}
              onCompositionStart={onCompositionStart}
              onCompositionEnd={onCompositionEnd}
              onPaste={onPaste}
              onSelect={rememberCaret}
              onKeyUp={rememberCaret}
              onBlur={rememberCaret}
              onFocus={() => {
                // Tapping into the field on a phone swaps the picker for the keyboard.
                if (phonePicker) setShowEmoji(false)
              }}
              placeholder={`Message #${SPACE_LABEL[space]}`}
              aria-label={editing ? 'Edit message' : undefined}
              rows={1}
              autoComplete="off"
              autoCorrect="on"
              autoCapitalize="sentences"
              spellCheck
              enterKeyHint="send"
              inputMode="text"
              className={`min-w-0 flex-1 resize-none overflow-y-auto bg-transparent py-2 leading-5 text-[color:var(--fg)] outline-none placeholder:text-[color:var(--muted)] ${
                isDesktop ? 'text-[15px]' : 'text-[16px]'
              }`}
              style={{ maxHeight: MAX_HEIGHT }}
            />

            {!editing && (
              <>
                <FieldButton
                  buttonRef={gifButtonRef}
                  label="Search GIFs"
                  onClick={() => {
                    setShowGif((v) => !v)
                    setShowEmoji(false)
                  }}
                >
                  <span className="text-[11px] font-bold leading-5">GIF</span>
                </FieldButton>
                <FieldButton label="Attach a file" onClick={() => fileInputRef.current?.click()}>
                  <Icon icon={Paperclip} />
                </FieldButton>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={submit}
            // Keeps the focus (and the phone keyboard) in the field.
            onMouseDown={(e) => e.preventDefault()}
            disabled={!canSubmit}
            aria-label={editing ? 'Save edit' : 'Send'}
            title={editing ? 'Save edit' : 'Send'}
            className="grid h-[38px] w-[38px] flex-none place-items-center rounded-full bg-[color:var(--accent)] text-[color:var(--on-accent)] transition-opacity disabled:opacity-40"
          >
            <Icon icon={editing ? Check : SendHorizontal} />
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          aria-label="Files to attach"
          onChange={(e) => {
            addFiles(e.target.files)
            e.target.value = ''
          }}
          className="hidden"
          accept="image/*,video/*,.pdf,.txt"
        />
        {showGif && <GifPicker anchorRef={gifButtonRef} onSelect={onGif} onClose={() => setShowGif(false)} />}
        {showEmoji && isDesktop && (
          <EmojiPicker mode="composer" isDesktop anchorRef={emojiButtonRef} insideRef={rootRef} onPick={onEmoji} onClose={closeEmoji} />
        )}
      </div>
      {phonePicker && (
        <EmojiPicker
          mode="composer"
          isDesktop={false}
          phone="inline"
          anchorRef={emojiButtonRef}
          insideRef={rootRef}
          onPick={onEmoji}
          onClose={closeEmoji}
        />
      )}
    </>
  )
}

function FieldButton({
  label,
  onClick,
  children,
  buttonRef,
  pressed,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
  buttonRef?: React.Ref<HTMLButtonElement>
  /** A toggle's state (aria-expanded), for the emoji button. */
  pressed?: boolean
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      aria-expanded={pressed}
      aria-label={label}
      title={label}
      className="grid h-9 w-9 flex-none place-items-center rounded-full text-[color:var(--muted)] transition-colors hover:text-[color:var(--fg)]"
    >
      {children}
    </button>
  )
}

/** The bar above the field while editing or replying. */
function ContextBar({
  icon,
  title,
  name,
  snippet,
  cancelLabel,
  onCancel,
}: {
  icon: LucideIcon
  title: string
  name?: string | null
  snippet: string
  cancelLabel: string
  onCancel: () => void
}) {
  return (
    <div className="mb-2 flex items-center gap-2 rounded-[10px] border-l-[3px] border-[color:var(--accent)] bg-[color:var(--field)] px-3 py-1.5 text-[13px]">
      <Icon icon={icon} size={16} className="flex-none text-[color:var(--accent)]" />
      <div className="min-w-0 flex-1">
        <div className="text-[color:var(--muted)]">
          <span>{title}</span>
          {name && (
            <>
              {' '}
              <span className="font-semibold text-[color:var(--accent)]">{name}</span>
            </>
          )}
        </div>
        <div className="truncate text-[color:var(--fg)] opacity-85">{snippet}</div>
      </div>
      <button
        type="button"
        onClick={onCancel}
        aria-label={cancelLabel}
        title={cancelLabel}
        className="grid h-7 w-7 flex-none place-items-center rounded-full text-[color:var(--muted)] hover:text-[color:var(--fg)]"
      >
        <Icon icon={X} size={16} />
      </button>
    </div>
  )
}
