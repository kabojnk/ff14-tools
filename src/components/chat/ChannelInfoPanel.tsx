import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { MediaViewer } from '@/components/gallery/MediaViewer'
import Markdown from '@/components/chat2/Markdown'
import { useEmojiStore } from '@/stores/emojiStore'
import { Portal } from '@/components/ui/Portal'
import { usePinnedMessages } from '@/hooks/usePinnedMessages'
import { MediaGallery } from '@/components/gallery/MediaGallery'
import { SPACE_LABEL } from '@/lib/spaces'
import { messagePreview } from '@/lib/chat/preview'
import { useJumpStore } from '@/stores/jumpStore'
import type { Message, Space } from '@/types'

export type InfoTab = 'media' | 'pins' | 'search'

interface ChannelInfoPanelProps {
  conversationId: string
  space: Space
  initialTab?: InfoTab
  onClose: () => void
  /** `overlay` (phones) covers the screen; `panel` (desktop) fills the right-hand slide-over. */
  variant?: 'overlay' | 'panel'
}

export function ChannelInfoPanel({ conversationId, space, initialTab = 'media', onClose, variant = 'overlay' }: ChannelInfoPanelProps) {
  const [activeTab, setActiveTab] = useState<InfoTab>(initialTab)

  // The desktop panel stays open while another entry point (e.g. "Search messages") picks a tab.
  useEffect(() => {
    setActiveTab(initialTab)
  }, [initialTab])
  const [pinnedMessages, setPinnedMessages] = useState<Message[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Message[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  // The scroll area: the gallery's infinite scroll and its "in view" checks are rooted here.
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null)

  const { pinnedIds, unpinMessage } = usePinnedMessages(conversationId)

  // Pinned messages of this space, newest pin first. Pins belong to the conversation; the space comes from the message.
  useEffect(() => {
    const ids = [...pinnedIds]
    if (ids.length === 0) {
      setPinnedMessages([])
      return
    }
    let active = true
    supabase
      .from('messages')
      .select('*')
      .in('id', ids)
      .eq('space', space)
      .eq('deleted', false)
      .then(({ data }) => {
        if (!active || !data) return
        const byId = Object.fromEntries((data as Message[]).map((m) => [m.id, m]))
        setPinnedMessages(ids.map((id) => byId[id]).filter(Boolean))
      })
    return () => {
      active = false
    }
  }, [pinnedIds, space])

  const handleUnpin = (messageId: string) => {
    void unpinMessage(messageId)
  }

  // The query whose results are showing: a space change (a jump from the gallery's "Both") re-runs it there.
  const [ranQuery, setRanQuery] = useState<string | null>(null)
  const searchSeq = useRef(0)
  const runSearch = useCallback(
    async (q: string) => {
      const seq = ++searchSeq.current
      setRanQuery(q)
      setSearchLoading(true)
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .eq('space', space)
        .eq('deleted', false)
        .ilike('content', `%${q}%`)
        .order('created_at', { ascending: false })
        .limit(50)
      if (seq !== searchSeq.current) return // a newer search (or the same one in the new space) answers instead
      setSearchResults((data as Message[]) ?? [])
      setSearchLoading(false)
    },
    [conversationId, space],
  )
  const handleSearch = () => {
    const q = searchQuery.trim()
    if (q) void runSearch(q)
  }
  const searchedSpace = useRef(space)
  useEffect(() => {
    if (searchedSpace.current === space) return
    searchedSpace.current = space
    if (ranQuery) void runSearch(ranQuery)
  }, [space, ranQuery, runSearch])

  /** Pins and search results show their message in the chat (AppShell closes the panel on phones). */
  const jump = (message: Message) =>
    useJumpStore.getState().request({ messageId: message.id, space: message.space, created_at: message.created_at })

  useEffect(() => {
    if (activeTab === 'search') {
      setTimeout(() => searchInputRef.current?.focus(), 100)
    }
  }, [activeTab])

  const tabs: { value: InfoTab; label: string }[] = [
    { value: 'media', label: 'Media' },
    { value: 'pins', label: 'Pins' },
    { value: 'search', label: 'Search' },
  ]

  const panel = variant === 'panel'
  const body = (
      <div className={panel ? 'flex h-full min-h-0 flex-col bg-primary' : 'fixed inset-0 z-40 flex flex-col bg-primary'}>
        {/* Header */}
        <div className={`flex-shrink-0 bg-secondary ${panel ? '' : 'pt-safe'}`}>
          <div className="flex h-12 items-center border-b border-[color:var(--line)] px-4">
            <button
              onClick={onClose}
              className="flex items-center gap-1 text-sm font-medium text-brand"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Back
            </button>
            <h1 className="flex-1 text-center text-base font-semibold text-primary">
              {SPACE_LABEL[space]}
            </h1>
            <div className="w-16" />
          </div>

          {/* Tabs */}
          <div className="flex border-b border-[color:var(--line)]">
            {tabs.map((t) => (
              <button
                key={t.value}
                onClick={() => setActiveTab(t.value)}
                className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                  activeTab === t.value
                    ? 'border-b-2 border-brand text-brand'
                    : 'text-interactive hover:text-interactive-hover'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div ref={setScrollEl} className="flex-1 overflow-y-auto">
          {/* ── Media tab ── */}
          {activeTab === 'media' && <MediaTab conversationId={conversationId} space={space} scrollRoot={scrollEl} />}

          {/* ── Pins tab ── */}
          {activeTab === 'pins' && (
            pinnedMessages.length === 0 ? (
              <EmptyState label="No pinned messages in this space." />
            ) : (
              <div className="divide-y divide-[color:var(--line)]">
                {pinnedMessages.map((msg) => (
                  <PinnedMessageCard
                    key={msg.id}
                    message={msg}
                    onShow={() => jump(msg)}
                    onUnpin={() => handleUnpin(msg.id)}
                  />
                ))}
              </div>
            )
          )}

          {/* ── Search tab ── */}
          {activeTab === 'search' && (
            <div className="flex flex-col gap-0">
              {/* Search bar */}
              <div className="sticky top-0 z-10 border-b border-[color:var(--line)] bg-secondary p-3">
                <div className="flex items-center gap-2 rounded-lg bg-input px-3 py-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-muted">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    ref={searchInputRef}
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder="Search messages…"
                    className="flex-1 bg-transparent text-sm text-primary outline-none placeholder:text-muted"
                  />
                  {searchQuery && (
                    <button
                      onClick={handleSearch}
                      className="text-xs font-medium text-brand"
                    >
                      Search
                    </button>
                  )}
                </div>
              </div>

              {/* Results */}
              {searchLoading && (
                <div className="py-12 text-center text-sm text-muted">Searching…</div>
              )}
              {!searchLoading && searchResults.length === 0 && searchQuery && (
                <EmptyState label={`No messages matching "${searchQuery}"`} />
              )}
              {!searchLoading && searchResults.length > 0 && (
                <div className="divide-y divide-[color:var(--line)]">
                  {searchResults.map((msg) => (
                    <SearchResultCard key={msg.id} message={msg} query={ranQuery ?? searchQuery} onShow={() => jump(msg)} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
  )
  return panel ? body : <Portal>{body}</Portal>
}

/** The Media tab: the gallery, opening a tapped photo, video or GIF in the viewer, with "Show in chat". */
function MediaTab({ conversationId, space, scrollRoot }: { conversationId: string; space: Space; scrollRoot: Element | null }) {
  return (
    <MediaGallery
      conversationId={conversationId}
      space={space}
      scrollRoot={scrollRoot}
      renderViewer={({ items, index, hasMore, loading, loadMore, onClose }) => (
        <MediaViewer
          items={items}
          index={index}
          hasMore={hasMore}
          loading={loading}
          onLoadMore={loadMore}
          onClose={onClose}
          onShowInChat={(item) => {
            onClose()
            useJumpStore.getState().request({ messageId: item.message_id, space: item.space, created_at: item.created_at })
          }}
        />
      )}
    />
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-1 items-center justify-center py-24 text-center text-sm text-muted">
      {label}
    </div>
  )
}

/** A pinned message. Tapping it shows it in the chat; links inside still open. */
function PinnedMessageCard({ message, onShow, onUnpin }: { message: Message; onShow: () => void; onUnpin: () => void }) {
  const emoji = useEmojiStore((s) => s.lookup)
  const date = new Date(message.created_at)
  const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' })

  return (
    <div data-pin-card className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-hover">
      <div className="mt-0.5 flex-shrink-0 text-muted">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="17" x2="12" y2="22" />
          <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
        </svg>
      </div>
      {/* A div with the button role: the rendered message may hold links, which can't sit inside a <button>. */}
      <div
        role="button"
        tabIndex={0}
        title="Show in chat"
        onClick={(e) => {
          if ((e.target as Element).closest('a')) return
          onShow()
        }}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return
          e.preventDefault()
          onShow()
        }}
        className="min-w-0 flex-1 cursor-pointer rounded text-left"
      >
        <div className="mb-1 flex items-baseline gap-2">
          <span className="text-xs text-muted">{dateStr}</span>
        </div>
        {message.content && (
          <div className="text-sm text-secondary">
            <Markdown content={message.content} emoji={emoji} />
          </div>
        )}
        {message.attachments?.length > 0 && (
          <div className="mt-1 text-xs text-muted italic">📎 {message.content ? 'Attachment' : messagePreview(message)}</div>
        )}
      </div>
      <button
        onClick={onUnpin}
        className="flex-shrink-0 rounded px-2 py-1 text-xs text-muted transition-colors hover:bg-hover hover:text-danger"
        title="Unpin"
      >
        Unpin
      </button>
    </div>
  )
}

/** A search result: a button that shows the message in the chat. */
function SearchResultCard({ message, query, onShow }: { message: Message; query: string; onShow: () => void }) {
  const date = new Date(message.created_at)
  const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })

  // Highlight matching text
  const highlight = (text: string) => {
    const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'))
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase()
        ? <mark key={i} className="rounded bg-[color:color-mix(in_srgb,var(--accent)_30%,transparent)] px-0.5 text-primary not-italic">{part}</mark>
        : part,
    )
  }

  return (
    <button type="button" data-search-result title="Show in chat" onClick={onShow} className="block w-full px-4 py-3 text-left transition-colors hover:bg-hover">
      <span className="mb-1 block text-xs text-muted">{dateStr}</span>
      {message.content && (
        <span className="block text-sm text-secondary">{highlight(message.content)}</span>
      )}
      {message.attachments?.length > 0 && (
        <span className="mt-1 block text-xs text-muted italic">📎 {message.content ? 'Attachment' : messagePreview(message)}</span>
      )}
    </button>
  )
}
