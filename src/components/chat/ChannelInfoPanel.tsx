import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { MediaViewer } from '@/components/chat/MediaViewer'
import { MarkdownRenderer } from '@/components/chat/MarkdownRenderer'
import { Portal } from '@/components/ui/Portal'
import type { Attachment, Channel, Message } from '@/types'

export type InfoTab = 'media' | 'pins' | 'search'

interface ChannelInfoPanelProps {
  channel: Channel
  initialTab?: InfoTab
  onClose: () => void
}

type MediaItem = { attachment: Attachment; message: Message }

export function ChannelInfoPanel({ channel, initialTab = 'media', onClose }: ChannelInfoPanelProps) {
  const [activeTab, setActiveTab] = useState<InfoTab>(initialTab)
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([])
  const [pinnedMessages, setPinnedMessages] = useState<Message[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Message[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [viewer, setViewer] = useState<{ url: string; filename: string; type: 'image' | 'gif' | 'video' } | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Fetch media on mount
  useEffect(() => {
    supabase
      .from('messages')
      .select('*')
      .eq('channel_id', channel.id)
      .eq('deleted', false)
      .order('created_at', { ascending: false })
      .limit(300)
      .then(({ data }) => {
        if (!data) return
        const items: MediaItem[] = []
        for (const msg of data as Message[]) {
          for (const att of msg.attachments ?? []) {
            if (att.type === 'image' || att.type === 'gif' || att.type === 'video') {
              items.push({ attachment: att, message: msg })
            }
          }
        }
        setMediaItems(items)
      })
  }, [channel.id])

  // Fetch pinned messages with content
  const fetchPins = async () => {
    const { data: pins } = await supabase
      .from('pinned_messages')
      .select('message_id')
      .eq('channel_id', channel.id)
      .order('pinned_at', { ascending: false })

    if (!pins || pins.length === 0) {
      setPinnedMessages([])
      return
    }

    const ids = pins.map((p: { message_id: string }) => p.message_id)
    const { data: messages } = await supabase
      .from('messages')
      .select('*')
      .in('id', ids)
      .eq('deleted', false)

    if (messages) {
      const byId = Object.fromEntries((messages as Message[]).map((m) => [m.id, m]))
      setPinnedMessages(ids.map((id: string) => byId[id]).filter(Boolean))
    }
  }

  useEffect(() => {
    fetchPins()
  }, [channel.id])

  const handleUnpin = async (messageId: string) => {
    await supabase
      .from('pinned_messages')
      .delete()
      .eq('channel_id', channel.id)
      .eq('message_id', messageId)
    fetchPins()
  }

  const handleSearch = async () => {
    const q = searchQuery.trim()
    if (!q) return
    setSearchLoading(true)
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('channel_id', channel.id)
      .eq('deleted', false)
      .ilike('content', `%${q}%`)
      .order('created_at', { ascending: false })
      .limit(50)
    setSearchResults((data as Message[]) ?? [])
    setSearchLoading(false)
  }

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

  return (
    <Portal>
      <div className="fixed inset-0 z-40 flex flex-col bg-primary">
        {/* Header */}
        <div className="flex-shrink-0 bg-secondary pt-safe">
          <div className="flex h-12 items-center border-b border-[hsl(var(--color-bg-tertiary))] px-4">
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
              #{channel.name}
            </h1>
            <div className="w-16" />
          </div>

          {/* Tabs */}
          <div className="flex border-b border-[hsl(var(--color-bg-tertiary))]">
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
        <div className="flex-1 overflow-y-auto">
          {/* ── Media tab ── */}
          {activeTab === 'media' && (
            mediaItems.length === 0 ? (
              <EmptyState label="No media in this channel yet." />
            ) : (
              <div className="grid grid-cols-3 gap-0.5 p-0.5">
                {mediaItems.map(({ attachment, message }, i) => (
                  <button
                    key={`${message.id}-${i}`}
                    onClick={() => setViewer({ url: attachment.url, filename: attachment.filename, type: attachment.type as 'image' | 'gif' | 'video' })}
                    className="relative aspect-square overflow-hidden bg-tertiary"
                  >
                    {attachment.type === 'video' ? (
                      <div className="flex h-full w-full items-center justify-center bg-tertiary text-muted">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </div>
                    ) : (
                      <img
                        src={attachment.url}
                        alt={attachment.filename}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    )}
                  </button>
                ))}
              </div>
            )
          )}

          {/* ── Pins tab ── */}
          {activeTab === 'pins' && (
            pinnedMessages.length === 0 ? (
              <EmptyState label="No pinned messages in this channel." />
            ) : (
              <div className="divide-y divide-[hsl(var(--color-bg-tertiary))]">
                {pinnedMessages.map((msg) => (
                  <PinnedMessageCard
                    key={msg.id}
                    message={msg}
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
              <div className="sticky top-0 z-10 border-b border-[hsl(var(--color-bg-tertiary))] bg-secondary p-3">
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
                <div className="divide-y divide-[hsl(var(--color-bg-tertiary))]">
                  {searchResults.map((msg) => (
                    <SearchResultCard key={msg.id} message={msg} query={searchQuery} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {viewer && (
        <MediaViewer
          url={viewer.url}
          filename={viewer.filename}
          type={viewer.type}
          onClose={() => setViewer(null)}
        />
      )}
    </Portal>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-1 items-center justify-center py-24 text-center text-sm text-muted">
      {label}
    </div>
  )
}

function PinnedMessageCard({ message, onUnpin }: { message: Message; onUnpin: () => void }) {
  const date = new Date(message.created_at)
  const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' })

  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="mt-0.5 flex-shrink-0 text-muted">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="17" x2="12" y2="22" />
          <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
        </svg>
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-baseline gap-2">
          <span className="text-xs text-muted">{dateStr}</span>
        </div>
        {message.content && (
          <div className="text-sm text-secondary">
            <MarkdownRenderer content={message.content} />
          </div>
        )}
        {message.attachments?.some((a) => a.type === 'image' || a.type === 'gif') && (
          <div className="mt-1 text-xs text-muted italic">📎 Attachment</div>
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

function SearchResultCard({ message, query }: { message: Message; query: string }) {
  const date = new Date(message.created_at)
  const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })

  // Highlight matching text
  const highlight = (text: string) => {
    const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'))
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase()
        ? <mark key={i} className="rounded bg-brand/30 px-0.5 text-primary not-italic">{part}</mark>
        : part,
    )
  }

  return (
    <div className="px-4 py-3">
      <div className="mb-1 text-xs text-muted">{dateStr}</div>
      {message.content && (
        <p className="text-sm text-secondary">{highlight(message.content)}</p>
      )}
      {message.attachments?.length > 0 && (
        <div className="mt-1 text-xs text-muted italic">📎 Attachment</div>
      )}
    </div>
  )
}
