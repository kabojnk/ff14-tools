import { useCallback, useEffect, useRef, useState } from 'react'
import { useMessages } from '@/hooks/useMessages'
import { usePinnedMessages } from '@/hooks/usePinnedMessages'
import { useAuthStore } from '@/stores/authStore'
import { useConversationStore } from '@/stores/conversationStore'
import { useUiStore } from '@/stores/uiStore'
import { supabase } from '@/lib/supabase'
import { createReadScheduler } from '@/lib/readScheduler'
import { spaceKey } from '@/lib/spaces'
import { MessageItem } from '@/components/chat/MessageItem'
import { TypingIndicator } from '@/components/chat/TypingIndicator'
import type { Message, Profile, Space } from '@/types'

interface MessageListProps {
  conversationId: string
  space: Space
  onSetReply?: (message: Message) => void
}

/** How close to the bottom (px) counts as having seen the newest message. */
const AT_BOTTOM_PX = 150

// Cache profiles in memory to avoid re-fetching
const profileCache: Record<string, Profile> = {}

export function MessageList({ conversationId, space, onSetReply }: MessageListProps) {
  const { messages, loading, realtimeStatus, broadcastEditMessage, broadcastDeleteMessage } = useMessages(conversationId, space)
  const { pinnedIds, pinMessage, unpinMessage } = usePinnedMessages(conversationId)
  const { profile } = useAuthStore()
  const eepMode = useUiStore((s) => s.eepMode)
  const key = spaceKey(conversationId, space)
  const showLoading = loading && messages.length === 0
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  // Increment to re-render when a cached profile is updated via realtime
  const [, setProfileVersion] = useState(0)
  // Tracks whether this is the initial load for the current channel
  const initialLoadDoneRef = useRef(false)
  // Tracks whether the user has scrolled up manually (so we don't hijack their position)
  const userScrolledUpRef = useRef(false)

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    const container = containerRef.current
    if (!container) return
    if (behavior === 'instant') {
      container.scrollTop = container.scrollHeight
    } else {
      bottomRef.current?.scrollIntoView({ behavior })
    }
  }

  // Reset state whenever the space changes
  useEffect(() => {
    initialLoadDoneRef.current = false
    userScrolledUpRef.current = false
  }, [key])

  // ── Mark read ──
  // One debounced, forward-only scheduler per mounted list. On unmount (e.g. back to the list on
  // mobile) a pending mark is flushed before the scheduler is disposed.
  const schedulerRef = useRef<ReturnType<typeof createReadScheduler> | null>(null)
  useEffect(() => {
    const scheduler = createReadScheduler(async (sp, at) => {
      const { error } = await supabase.rpc('mark_read', { p_conversation: conversationId, p_space: sp, p_at: at })
      if (error) throw error
    })
    schedulerRef.current = scheduler
    const onPageHide = () => void scheduler.flush()
    window.addEventListener('pagehide', onPageHide)
    return () => {
      window.removeEventListener('pagehide', onPageHide)
      if (schedulerRef.current === scheduler) schedulerRef.current = null
      void scheduler.flush()
      scheduler.dispose()
    }
  }, [conversationId])

  // The newest message counts as read only while the list is at the bottom, the app is in the
  // foreground and not disguised (AppShell stays mounted behind Eep mode).
  const checkRead = useCallback(() => {
    const container = containerRef.current
    const newest = messages[messages.length - 1]
    if (!container || !newest) return
    if (container.scrollHeight - container.scrollTop - container.clientHeight > AT_BOTTOM_PX) return
    if (document.visibilityState !== 'visible') return
    if (useUiStore.getState().eepMode) return
    useConversationStore.getState().markReadLocal(space, newest.created_at)
    schedulerRef.current?.schedule(space, newest.created_at)
  }, [messages, space])
  const checkReadRef = useRef(checkRead)
  checkReadRef.current = checkRead

  useEffect(() => {
    checkRead()
  }, [checkRead])

  useEffect(() => {
    const onVisibility = () => checkReadRef.current()
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  // Unlocking (leaving Eep mode) shows the list again.
  useEffect(() => {
    if (!eepMode) checkReadRef.current()
  }, [eepMode])

  // Track manual upward scrolling so the ResizeObserver doesn't override it.
  // The container remounts after the loading state, hence the dependency.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const onScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container
      userScrolledUpRef.current = scrollHeight - scrollTop - clientHeight > AT_BOTTOM_PX
      checkReadRef.current()
    }
    container.addEventListener('scroll', onScroll, { passive: true })
    return () => container.removeEventListener('scroll', onScroll)
  }, [showLoading])

  // Scroll to bottom when messages arrive
  useEffect(() => {
    if (messages.length === 0) return

    if (!initialLoadDoneRef.current) {
      // Initial load: jump instantly so images don't leave us mid-list,
      // then retry 400 ms later to catch images that finish loading after the first paint.
      initialLoadDoneRef.current = true
      userScrolledUpRef.current = false
      scrollToBottom('instant')
      const t = setTimeout(() => scrollToBottom('instant'), 400)
      return () => clearTimeout(t)
    }

    // New message arrived: smooth scroll only if the user is already near the bottom
    if (!userScrolledUpRef.current) {
      scrollToBottom('smooth')
    }
  }, [messages.length])

  // Also scroll when content height grows (reactions, image load-in, etc.),
  // but only if the user hasn't scrolled up
  useEffect(() => {
    const content = contentRef.current
    const container = containerRef.current
    if (!content || !container) return

    const observer = new ResizeObserver(() => {
      if (!userScrolledUpRef.current) {
        container.scrollTop = container.scrollHeight
      }
    })

    observer.observe(content)
    return () => observer.disconnect()
  }, [showLoading])

  // Store the current user's profile in cache and trigger re-render so
  // display name changes appear immediately in existing message headers.
  useEffect(() => {
    if (profile) {
      profileCache[profile.id] = profile
      setProfileVersion((v) => v + 1)
    }
  }, [profile])

  // Keep profile cache fresh for all users via realtime
  useEffect(() => {
    const channel = supabase
      .channel('message-list-profiles')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        (payload) => {
          const updated = payload.new as Profile
          if (profileCache[updated.id]) {
            profileCache[updated.id] = { ...profileCache[updated.id], ...updated }
            setProfileVersion((v) => v + 1)
          }
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  // Fetch missing profiles
  useEffect(() => {
    const missingIds = new Set<string>()
    for (const msg of messages) {
      if (!profileCache[msg.author_id] && !msg.author) {
        missingIds.add(msg.author_id)
      }
    }
    if (missingIds.size > 0) {
      supabase
        .from('profiles')
        .select('*')
        .in('id', Array.from(missingIds))
        .then(({ data }) => {
          if (data) {
            for (const p of data) {
              profileCache[p.id] = p as Profile
            }
          }
        })
    }
  }, [messages])

  const getAuthor = (authorId: string): Profile | null => {
    return profileCache[authorId] ?? null
  }

  // Determine if message should show header (different author or >5 min gap from previous)
  const shouldShowHeader = (index: number): boolean => {
    if (index === 0) return true
    const prev = messages[index - 1]
    const curr = messages[index]
    if (prev.author_id !== curr.author_id) return true
    const gap = new Date(curr.created_at).getTime() - new Date(prev.created_at).getTime()
    return gap > 5 * 60 * 1000 // 5 minutes
  }

  if (showLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-muted">Loading messages...</div>
      </div>
    )
  }

  return (
    <div ref={containerRef} data-realtime={realtimeStatus} className="flex flex-1 flex-col overflow-y-auto">
      {/* Spacer to push content to bottom when there aren't many messages */}
      <div className="flex-1" />

      {messages.length === 0 && !loading && (
        <div className="px-4 py-8 text-center">
          <p className="text-lg font-semibold text-primary">Welcome to the space!</p>
          <p className="mt-1 text-sm text-muted">This is the start of the conversation.</p>
        </div>
      )}

      <div ref={contentRef}>
        {messages.map((message, i) => (
          <MessageItem
            key={message.id}
            message={message}
            author={message.author ?? getAuthor(message.author_id)}
            showHeader={shouldShowHeader(i)}
            spaceKey={key}
            isPinned={pinnedIds.has(message.id)}
            onBroadcastEdit={broadcastEditMessage}
            onBroadcastDelete={broadcastDeleteMessage}
            onPin={pinMessage}
            onUnpin={unpinMessage}
            onSetReply={onSetReply}
          />
        ))}

        {/* Typing indicator */}
        <TypingIndicator space={space} />

        <div ref={bottomRef} className="h-1" />
      </div>
    </div>
  )
}
