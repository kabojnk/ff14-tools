import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useMessages } from '@/hooks/useMessages'
import { usePinnedMessages } from '@/hooks/usePinnedMessages'
import { useTyping } from '@/hooks/useTyping'
import { DESKTOP_QUERY, useMediaQuery } from '@/hooks/useMediaQuery'
import { useAuthStore } from '@/stores/authStore'
import { useConversationStore } from '@/stores/conversationStore'
import { useEmojiStore } from '@/stores/emojiStore'
import { useJumpStore } from '@/stores/jumpStore'
import { useMessageStore } from '@/stores/messageStore'
import { useProfileStore } from '@/stores/profileStore'
import { useUiStore } from '@/stores/uiStore'
import { supabase } from '@/lib/supabase'
import { sendMessageEvent } from '@/lib/conversationRealtime'
import { createReadScheduler } from '@/lib/readScheduler'
import { spaceKey } from '@/lib/spaces'
import { firstUnreadIndex, groupRuns, insertDateChips, tickState } from '@/lib/chat'
import { retryOutgoing } from '@/lib/chat/outbox'
import { DateChip } from '@/components/chat2/DateChip'
import { JumpToLatest } from '@/components/chat2/JumpToLatest'
import { MessageRow, type RowMotion } from '@/components/chat2/MessageRow'
import { NewDivider } from '@/components/chat2/NewDivider'
import { TypingBubble } from '@/components/chat2/TypingBubble'
import type { Message, Space } from '@/types'

interface MessageListProps {
  conversationId: string
  space: Space
  onSetReply?: (message: Message) => void
}

/** How close to the bottom (px) counts as having seen the newest message. */
const AT_BOTTOM_PX = 150
/** After a programmatic scroll to the bottom, count as at the bottom while it animates. */
const PIN_WINDOW_MS = 700
/** Older pages loaded while looking for a reply's original. */
const MAX_REPLY_PAGES = 10
/** A safety cap for jumps from outside the list (gallery, pins, search), which page back by time instead. */
const MAX_JUMP_PAGES = 200

/**
 * Where each space was left: 'bottom' or a scrollTop. The list remounts per space, so switching tabs
 * comes back to the same place. Module-level: it outlives the component, not the page.
 */
const scrollMemory = new Map<string, number | 'bottom'>()

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()))
const time = (iso: string) => Date.parse(iso)

/** The open space's messages in the Cozy look: runs, date chips, ticks, new-messages divider, jump to latest. */
export function MessageList({ conversationId, space, onSetReply }: MessageListProps) {
  const { messages, ready, realtimeStatus } = useMessages(conversationId, space)
  const { pinnedIds, pinMessage, unpinMessage } = usePinnedMessages(conversationId)
  // Also keeps typingStore pruned while the list is open.
  const { typingUsers } = useTyping(space)
  const isDesktop = useMediaQuery(DESKTOP_QUERY)
  const myId = useAuthStore((s) => s.user?.id) ?? ''
  const eepMode = useUiStore((s) => s.eepMode)
  const readAt = useConversationStore((s) => s.readAt[space])
  const partnerId = useConversationStore((s) => s.memberIds.find((m) => m !== myId) ?? null)
  const partnerReadAtRaw = useConversationStore((s) => s.partnerReadAt[space])
  const myReceipts = useProfileStore((s) => s.profiles[myId]?.read_receipts)
  const partnerReceipts = useProfileStore((s) => (partnerId ? s.profiles[partnerId]?.read_receipts : undefined))
  const emoji = useEmojiStore((s) => s.lookup)
  const key = spaceKey(conversationId, space)

  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const dividerRef = useRef<HTMLDivElement>(null)
  const atBottomRef = useRef(true)
  const pinnedUntilRef = useRef(0)
  const openedRef = useRef(false)
  const [opened, setOpened] = useState(false)
  const [far, setFar] = useState(false)
  const [seenUpTo, setSeenUpTo] = useState(Number.NEGATIVE_INFINITY)
  const [flashId, setFlashId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    void useEmojiStore.getState().load()
  }, [])

  // ── Read ticks ──
  // Either person turning read receipts off hides read positions (RLS), so the ticks stay at ✓.
  const receiptsOn = myReceipts !== false && partnerReceipts !== false
  const partnerReadAt = receiptsOn ? partnerReadAtRaw : null
  const receiptsWereOn = useRef(receiptsOn)
  useEffect(() => {
    // Back on: what they read meanwhile was hidden, so fetch it.
    if (receiptsOn && !receiptsWereOn.current && myId) void useConversationStore.getState().refreshPartnerReadAt(myId)
    receiptsWereOn.current = receiptsOn
  }, [receiptsOn, myId])

  // ── Opening snapshot ──
  // Taken once the first fetch answers: where the divider goes (my read position at open) and the
  // newest message then (anything after it animates in; history and the initial load don't).
  const [snapshot, setSnapshot] = useState<{ dividerId: string | null; after: number } | null>(null)
  if (ready && snapshot === null) {
    const i = firstUnreadIndex(messages, readAt, myId)
    const newest = messages[messages.length - 1]
    setSnapshot({
      dividerId: i >= 0 ? messages[i].id : null,
      after: newest ? time(newest.created_at) : Date.now() - 60_000,
    })
  }

  const items = useMemo(() => insertDateChips(groupRuns(messages), new Date()), [messages])

  // Motion is decided once per message, so confirming a sent message doesn't restart its animation.
  const motionRef = useRef(new Map<string, RowMotion>())
  const motionFor = (m: Message): RowMotion => {
    const known = motionRef.current.get(m.id)
    if (known !== undefined) return known
    if (!snapshot) return null
    const motion: RowMotion = time(m.created_at) > snapshot.after || m.localState ? (m.localState ? 'sent' : 'in') : null
    motionRef.current.set(m.id, motion)
    return motion
  }

  // ── Scrolling ──
  const scrollToBottom = useCallback((behavior: ScrollBehavior) => {
    const c = containerRef.current
    if (!c) return
    atBottomRef.current = true
    if (behavior === 'smooth') {
      // The scroll events while it animates aren't the person leaving the bottom.
      pinnedUntilRef.current = Date.now() + PIN_WINDOW_MS
      c.scrollTo({ top: c.scrollHeight, behavior })
    } else {
      c.scrollTop = c.scrollHeight
    }
  }, [])

  /** Keeps the bottom in view when content grows (images, code highlighting, the keyboard) if it was there. */
  const repin = useCallback(() => {
    const c = containerRef.current
    if (c && openedRef.current && atBottomRef.current) c.scrollTop = c.scrollHeight
  }, [])

  /** The newest message whose top is inside the viewport: everything up to it has been seen. */
  const updateSeen = useCallback(() => {
    const c = containerRef.current
    const content = contentRef.current
    if (!c || !content) return
    const bottom = c.scrollTop + c.clientHeight
    const rows = content.querySelectorAll<HTMLElement>('[data-message-id]')
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i].offsetTop < bottom) {
        const at = time(rows[i].dataset.at ?? '')
        if (!Number.isNaN(at)) setSeenUpTo((prev) => Math.max(prev, at))
        return
      }
    }
  }, [])

  // ── Mark read ──
  // One debounced, forward-only scheduler per mounted list. On unmount (e.g. back to the list on
  // phones) a pending mark is flushed before the scheduler is disposed.
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
    const c = containerRef.current
    let newest: Message | undefined
    for (let i = messages.length - 1; i >= 0 && !newest; i--) if (!messages[i].localState) newest = messages[i]
    if (!c || !newest || !openedRef.current) return
    if (c.scrollHeight - c.scrollTop - c.clientHeight > AT_BOTTOM_PX) return
    if (document.visibilityState !== 'visible') return
    if (useUiStore.getState().eepMode) return
    useConversationStore.getState().markReadLocal(space, newest.created_at)
    schedulerRef.current?.schedule(space, newest.created_at)
  }, [messages, space])
  const checkReadRef = useRef(checkRead)
  checkReadRef.current = checkRead

  useEffect(() => {
    checkRead()
  }, [checkRead, opened])

  useEffect(() => {
    const onVisibility = () => checkReadRef.current()
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  // Unlocking (leaving Eep mode) shows the list again.
  useEffect(() => {
    if (!eepMode) checkReadRef.current()
  }, [eepMode])

  // ── Open position ── the divider near the top if there's unread; else where this space was left; else the bottom.
  useLayoutEffect(() => {
    const c = containerRef.current
    if (!c || !snapshot || openedRef.current) return
    const memory = scrollMemory.get(key)
    if (snapshot.dividerId && dividerRef.current) {
      c.scrollTop = Math.max(0, dividerRef.current.offsetTop - 56)
    } else if (typeof memory === 'number') {
      c.scrollTop = memory
    } else {
      scrollToBottom('instant')
    }
    const dist = c.scrollHeight - c.scrollTop - c.clientHeight
    atBottomRef.current = dist <= AT_BOTTOM_PX
    openedRef.current = true
    setOpened(true)
    setFar(dist > c.clientHeight)
    updateSeen()
  }, [snapshot, key, scrollToBottom, updateSeen])

  // Images that finish loading after the first paint: stay at the bottom if that's where we opened.
  useEffect(() => {
    if (!opened) return
    const t = setTimeout(repin, 400)
    return () => clearTimeout(t)
  }, [opened, repin])

  useEffect(() => {
    const c = containerRef.current
    if (!c) return
    const onScroll = () => {
      const dist = c.scrollHeight - c.scrollTop - c.clientHeight
      atBottomRef.current = dist <= AT_BOTTOM_PX || Date.now() < pinnedUntilRef.current
      if (openedRef.current) scrollMemory.set(key, dist <= AT_BOTTOM_PX ? 'bottom' : c.scrollTop)
      setFar(dist > c.clientHeight)
      updateSeen()
      checkReadRef.current()
    }
    c.addEventListener('scroll', onScroll, { passive: true })
    return () => c.removeEventListener('scroll', onScroll)
  }, [key, updateSeen])

  // A new message at the end: follow it if we were at the bottom, or if it's mine being sent.
  const last = messages[messages.length - 1]
  const lastIdRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!opened || !last) return
    if (lastIdRef.current === undefined || lastIdRef.current === last.id) {
      lastIdRef.current = last.id
      return
    }
    lastIdRef.current = last.id
    if (atBottomRef.current || (last.author_id === myId && last.localState === 'sending')) scrollToBottom('smooth')
    else updateSeen()
  }, [opened, last, myId, scrollToBottom, updateSeen])

  // Content growing (images, reactions, code highlighting, the typing bubble) keeps the bottom pinned.
  useEffect(() => {
    const content = contentRef.current
    if (!content || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(repin)
    observer.observe(content)
    return () => observer.disconnect()
  }, [repin])

  // The on-screen keyboard shrinks the visual viewport: re-pin if we were at the bottom.
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    vv.addEventListener('resize', repin)
    return () => vv.removeEventListener('resize', repin)
  }, [repin])

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 3000)
    return () => clearTimeout(t)
  }, [notice])

  useEffect(() => {
    if (!flashId) return
    const t = setTimeout(() => setFlashId(null), 1300)
    return () => clearTimeout(t)
  }, [flashId])

  // ── Row callbacks (stable, so memoised rows don't re-render on scroll) ──
  const onRetry = useCallback((id: string) => void retryOutgoing(key, id), [key])
  const onPin = useCallback((id: string) => void pinMessage(id), [pinMessage])
  const onUnpin = useCallback((id: string) => void unpinMessage(id), [unpinMessage])
  const onBroadcastDelete = useCallback((id: string) => sendMessageEvent('delete', { id, space }), [space])

  const findRow = useCallback(
    (id: string) => containerRef.current?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(id)}"]`) ?? null,
    [],
  )

  /**
   * Centres a found row and flashes it. The list is no longer "at the bottom", and the position is remembered,
   * so the 400 ms re-pin, the ResizeObserver and a later return to this space don't scroll it away.
   */
  const reveal = useCallback(
    (el: HTMLElement, id: string) => {
      const c = containerRef.current
      if (!c) return
      atBottomRef.current = false
      pinnedUntilRef.current = 0
      const top = Math.max(0, el.offsetTop - (c.clientHeight - el.offsetHeight) / 2)
      scrollMemory.set(key, top)
      c.scrollTo({ top, behavior: 'smooth' })
      setFlashId(id)
    },
    [key],
  )

  /** Scrolls to a reply's original and flashes it, loading older pages (up to 10) until it's found. */
  const onJump = useCallback(
    async (id: string) => {
      let el = findRow(id)
      for (let page = 0; !el && page < MAX_REPLY_PAGES; page++) {
        const more = await useMessageStore.getState().fetchOlder(conversationId, space)
        await nextFrame()
        await nextFrame()
        el = findRow(id)
        if (!more) break
      }
      if (!el) {
        setNotice("Couldn't find the original message")
        return
      }
      reveal(el, id)
    },
    [conversationId, space, findRow, reveal],
  )

  /**
   * A jump from outside the list ("Show in chat", a pin, a search result): pages back until the oldest loaded
   * message is older than the target's time (or the history ends), then flashes it, or says it's gone.
   */
  const jumpTo = useCallback(
    async (id: string, createdAt: string) => {
      const target = time(createdAt)
      const loadedPast = () => {
        const oldest = (useMessageStore.getState().messages[key] ?? []).find((m) => !m.localState)
        // Strictly older: messages sharing the target's time may sit on the next page back.
        return !oldest || time(oldest.created_at) < target
      }
      let el = findRow(id)
      for (let page = 0; !el && !loadedPast() && page < MAX_JUMP_PAGES; page++) {
        const more = await useMessageStore.getState().fetchOlder(conversationId, space)
        await nextFrame()
        await nextFrame()
        el = findRow(id)
        if (!more) break
      }
      if (!el) {
        setNotice("Couldn't find that message. It may have been deleted.")
        return
      }
      reveal(el, id)
    },
    [conversationId, space, key, findRow, reveal],
  )

  // Taken only once the list has opened (after the open-position layout effect), so the jump wins over it.
  // A jump that switched space is taken by the new list as soon as it opens.
  const pendingJump = useJumpStore((s) => s.pending)
  useEffect(() => {
    if (!ready || !opened || !pendingJump) return
    const request = useJumpStore.getState().take(space)
    if (request) void jumpTo(request.messageId, request.created_at)
  }, [ready, opened, pendingJump, space, jumpTo])

  const unseen = useMemo(
    () => messages.filter((m) => m.author_id !== myId && time(m.created_at) > seenUpTo).length,
    [messages, myId, seenUpTo],
  )

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={containerRef}
        data-realtime={realtimeStatus}
        data-space-list={space}
        className={`bg-wall relative flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain ${isDesktop ? 'px-[8%]' : 'px-3'}`}
        style={{ ['--bubble-max' as string]: isDesktop ? '62%' : '78%' }}
      >
        {/* Pushes a short conversation to the bottom. */}
        <div className="flex-1" />

        {!ready && messages.length === 0 && <div className="py-8 text-center text-sm text-[color:var(--muted)]">Loading messages…</div>}
        {ready && messages.length === 0 && (
          <div className="px-4 py-8 text-center">
            <p className="text-lg font-semibold text-[color:var(--fg)]">Welcome to the space!</p>
            <p className="mt-1 text-sm text-[color:var(--muted)]">This is the start of the conversation.</p>
          </div>
        )}

        <div ref={contentRef} className={`flex flex-col pb-2 pt-2 ${opened ? '' : 'invisible'}`}>
          {items.map((item) => {
            if (item.kind === 'chip') return <DateChip key={item.key} label={item.label} />
            const { message, runStart } = item.row
            const mine = message.author_id === myId
            return (
              <Fragment key={message.id}>
                {snapshot?.dividerId === message.id && <NewDivider ref={dividerRef} />}
                <MessageRow
                  message={message}
                  mine={mine}
                  runStart={runStart || snapshot?.dividerId === message.id}
                  tick={mine ? tickState(message, partnerReadAt) : undefined}
                  motion={motionFor(message)}
                  flash={flashId === message.id}
                  pinned={pinnedIds.has(message.id)}
                  spaceKey={key}
                  isDesktop={isDesktop}
                  emoji={emoji}
                  onHighlight={repin}
                  onRetry={onRetry}
                  onJump={onJump}
                  onBroadcastDelete={onBroadcastDelete}
                  onPin={onPin}
                  onUnpin={onUnpin}
                  onSetReply={onSetReply}
                  onNotice={setNotice}
                />
              </Fragment>
            )
          })}
          {typingUsers.length > 0 && <TypingBubble names={typingUsers.map((t) => t.nickname)} />}
        </div>
      </div>

      {far && opened && (
        <div className="absolute bottom-3 right-3 z-10">
          <JumpToLatest count={unseen} onClick={() => scrollToBottom('smooth')} />
        </div>
      )}
      {notice && (
        <div role="status" className="msg-in absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full bg-[color:var(--bar)] px-3 py-1.5 text-sm text-[color:var(--fg)] shadow-[0_2px_8px_var(--shadow)]">
          {notice}
        </div>
      )}
    </div>
  )
}
