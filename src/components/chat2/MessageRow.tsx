import { memo, useEffect, useState } from 'react'
import { Bubble } from '@/components/chat2/Bubble'
import { DateChip } from '@/components/chat2/DateChip'
import { ReplyStrip } from '@/components/chat2/ReplyStrip'
import type { EmojiLookup } from '@/components/chat2/Markdown'
import { LegacyMessageExtras } from '@/components/chat/legacy/LegacyMessageExtras'
import { supabase } from '@/lib/supabase'
import type { Tick } from '@/lib/chat'
import { useMessageStore } from '@/stores/messageStore'
import { useProfileStore } from '@/stores/profileStore'
import type { Message } from '@/types'

export type RowMotion = 'in' | 'sent' | null

interface MessageRowProps {
  message: Message
  mine: boolean
  runStart: boolean
  tick?: Tick
  /** Arrived after the space was opened: fades in (theirs) or springs in (mine). */
  motion: RowMotion
  flash: boolean
  pinned: boolean
  /** spaceKey(conversationId, space) of the list. */
  spaceKey: string
  emoji: EmojiLookup
  onHighlight: () => void
  onRetry: (id: string) => void
  onJump: (id: string) => void
  onBroadcastDelete: (id: string) => void
  onPin: (id: string) => void
  onUnpin: (id: string) => void
  onSetReply?: (message: Message) => void
}

const MOTION_CLASS = { in: 'msg-in', sent: 'msg-sent' } as const

/** One message in the list: a system note, or a bubble aligned to its side, with the legacy extras around it. */
export const MessageRow = memo(function MessageRow(props: MessageRowProps) {
  const { message, mine, runStart, tick, motion, flash, pinned, spaceKey, emoji, onHighlight, onRetry, onJump } = props
  const original = useReplyOriginal(message.reply_to, spaceKey)
  const originalAuthor = useProfileStore((s) => (original ? (s.profiles[original.author_id]?.nickname ?? null) : null))

  const rowClass = `flex flex-col ${mine ? 'items-end' : 'items-start'} ${runStart ? 'mt-2' : 'mt-0.5'} ${
    motion ? MOTION_CLASS[motion] : ''
  } ${flash ? 'msg-flash' : ''}`

  if (message.type === 'system') {
    return (
      <div data-message-id={message.id} data-at={message.created_at} className="flex flex-col items-center">
        <DateChip label={message.content ?? ''} system />
      </div>
    )
  }

  const bubble = (
    <Bubble
      message={message}
      mine={mine}
      tail={runStart}
      tick={tick}
      onRetry={() => onRetry(message.id)}
      emoji={emoji}
      onHighlight={onHighlight}
      pinned={pinned}
      header={
        message.reply_to ? (
          <ReplyStrip original={original} authorName={originalAuthor} onJump={() => onJump(message.reply_to!)} />
        ) : undefined
      }
    />
  )

  return (
    <div data-message-id={message.id} data-at={message.created_at} data-mine={mine} className={rowClass}>
      {message.localState ? (
        bubble
      ) : (
        <LegacyMessageExtras
          message={message}
          isOwn={mine}
          spaceKey={spaceKey}
          isPinned={pinned}
          onBroadcastDelete={props.onBroadcastDelete}
          onPin={props.onPin}
          onUnpin={props.onUnpin}
          onSetReply={props.onSetReply}
        >
          {bubble}
        </LegacyMessageExtras>
      )}
    </div>
  )
})

/**
 * The message a reply points at: from the loaded list, else fetched once (RLS hides dragged ones).
 * null when it's gone, undefined while looking or when there's no reply.
 */
function useReplyOriginal(id: string | null, key: string): Message | null | undefined {
  const loaded = useMessageStore((s) => (id ? s.messages[key]?.find((m) => m.id === id) : undefined))
  const [fetched, setFetched] = useState<{ id: string; message: Message | null } | null>(null)

  useEffect(() => {
    if (!id || loaded || fetched?.id === id) return
    let live = true
    void supabase
      .from('messages')
      .select('*')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => {
        const m = data as Message | null
        if (live) setFetched({ id, message: m && !m.deleted ? m : null })
      })
    return () => {
      live = false
    }
  }, [id, loaded, fetched])

  if (!id) return undefined
  if (loaded) return loaded
  return fetched?.id === id ? fetched.message : undefined
}
