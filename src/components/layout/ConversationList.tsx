import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { SPACES, isUnread } from '@/lib/spaces'
import { listTimeLabel } from '@/lib/chat/preview'
import { useAuthStore } from '@/stores/authStore'
import { useConversationStore } from '@/stores/conversationStore'
import { usePartner } from '@/hooks/usePartner'
import { Avatar } from '@/components/ui/Avatar'
import type { Space } from '@/types'

/**
 * Unread messages across both spaces (not mine, newer than my read position). Counted on the server
 * only for spaces that are unread, and again whenever a space's newest message or my read position moves.
 */
function useUnreadCount(conversationId: string | null, myId: string | null, unreadSpaces: Space[], readAt: Record<Space, string | null>, latestKey: string) {
  const [count, setCount] = useState(0)
  const spacesKey = unreadSpaces.join(',')
  useEffect(() => {
    if (!conversationId || !myId || unreadSpaces.length === 0) {
      setCount(0)
      return
    }
    let active = true
    void Promise.all(
      unreadSpaces.map(async (space) => {
        let q = supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('conversation_id', conversationId)
          .eq('space', space)
          .eq('deleted', false)
          .neq('author_id', myId)
        const since = readAt[space]
        if (since) q = q.gt('created_at', since)
        const { count: n, error } = await q
        // An unread space counts at least one, even if the count can't be read.
        return error || n === null ? 1 : Math.max(1, n)
      }),
    ).then((per) => {
      if (active) setCount(per.reduce((a, b) => a + b, 0))
    })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the values that change the answer
  }, [conversationId, myId, spacesKey, readAt.main, readAt.schist, latestKey])
  return count
}

interface ConversationListProps {
  /** Opens the conversation (on phones, switches to the chat view). */
  onOpen?: () => void
  /** Highlights the open conversation (desktop). */
  activeHighlight?: boolean
}

/** The conversation rows: avatar with presence, name, newest message across both spaces, time, unread badge. */
export function ConversationList({ onOpen, activeHighlight = false }: ConversationListProps) {
  const myId = useAuthStore((s) => s.user?.id ?? null)
  const conversation = useConversationStore((s) => s.conversation)
  const loading = useConversationStore((s) => s.loading)
  const latest = useConversationStore((s) => s.latest)
  const readAt = useConversationStore((s) => s.readAt)
  const { id: partnerId, profile: partner, presence } = usePartner()

  const unreadSpaces = SPACES.filter((space) =>
    isUnread({ latestAt: latest[space]?.at ?? null, latestAuthorId: latest[space]?.authorId ?? null, lastReadAt: readAt[space], myId }),
  )
  const newest = SPACES.map((s) => latest[s])
    .filter((l): l is NonNullable<typeof l> => l !== null)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0]
  const count = useUnreadCount(conversation?.id ?? null, myId, unreadSpaces, readAt, `${latest.main?.at}|${latest.schist?.at}`)

  if (!conversation) {
    return loading ? null : (
      <div className="px-4 py-6 text-center text-[color:var(--muted)]">
        <p className="text-sm font-semibold">No conversation yet</p>
        <p className="mt-1 text-xs">Nobody has added you to a conversation.</p>
      </div>
    )
  }

  const name = partner?.nickname ?? conversation.title ?? 'Conversation'
  const unread = unreadSpaces.length > 0

  return (
    <div className="flex flex-col gap-0.5 py-1">
      <button
        type="button"
        data-conversation={conversation.id}
        data-unread={String(unread)}
        onClick={onOpen}
        className={`mx-1.5 flex items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left transition-colors hover:bg-[color:var(--seg)] ${
          activeHighlight ? 'bg-[color:var(--seg-on)]' : ''
        }`}
      >
        <Avatar name={name} url={partner?.avatar_url} size={40} presence={partnerId ? presence : undefined} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-1.5">
            <span className="truncate text-[13.5px] font-semibold text-[color:var(--fg)]">{name}</span>
            {newest && (
              <small className={`flex-none text-[11px] ${unread ? 'text-[color:var(--accent)]' : 'text-[color:var(--muted)]'}`}>
                {listTimeLabel(newest.at, new Date())}
              </small>
            )}
          </span>
          <span className="flex items-center justify-between gap-1.5 text-xs text-[color:var(--muted)]">
            <span className="truncate">{newest?.preview ?? ''}</span>
            {count > 0 && (
              <span
                aria-label={`${count} unread`}
                className="grid h-[18px] min-w-[18px] flex-none place-items-center rounded-[9px] bg-[color:var(--accent)] px-[5px] text-[10.5px] font-bold text-on-accent"
              >
                {count}
              </span>
            )}
          </span>
        </span>
      </button>
    </div>
  )
}
