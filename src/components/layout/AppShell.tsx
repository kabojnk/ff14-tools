import { useEffect, useRef, useState } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { useConversationStore } from '@/stores/conversationStore'
import { useUiStore } from '@/stores/uiStore'
import { useStatusStore } from '@/stores/statusStore'
import { useConversationRealtime } from '@/hooks/useConversationRealtime'
import { DESKTOP_QUERY, useMediaQuery } from '@/hooks/useMediaQuery'
import { defaultPhoneView, type PhoneView } from '@/lib/layout'
import { ChatHeader } from '@/components/chat2/ChatHeader'
import { ReconnectBar } from '@/components/chat2/ReconnectBar'
import { MessageList } from '@/components/chat/MessageList'
import { MessageInput } from '@/components/chat/MessageInput'
import { ChannelInfoPanel, type InfoTab } from '@/components/chat/ChannelInfoPanel'
import { LeftColumn } from '@/components/layout/LeftColumn'
import { ConversationList } from '@/components/layout/ConversationList'
import { MeRow } from '@/components/layout/MeRow'
import { SlideOver } from '@/components/layout/SlideOver'
import type { Message } from '@/types'

/**
 * Phone: straight into the chat; the header's back chevron leads to the conversation list.
 * Desktop: left column | chat | right slide-over (media, pins, search).
 * Only one layout tree is mounted, so the chat hooks (realtime, typing, pins) never run twice.
 */
export function AppShell() {
  const isDesktop = useMediaQuery(DESKTOP_QUERY)
  const setEepMode = useUiStore((s) => s.setEepMode)
  const userId = useAuthStore((s) => s.user?.id)
  const conversation = useConversationStore((s) => s.conversation)
  const conversationLoading = useConversationStore((s) => s.loading)
  const activeSpace = useConversationStore((s) => s.activeSpace)
  const loadConversation = useConversationStore((s) => s.load)
  // null until the person navigates: then the default follows the number of conversations.
  const [chosenView, setChosenView] = useState<PhoneView | null>(null)
  const [infoTab, setInfoTab] = useState<InfoTab>('media')
  const [showInfo, setShowInfo] = useState(false)
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const keyboardHeight = useKeyboardHeight(!isDesktop)

  const conversationCount = conversation ? 1 : 0
  const phoneView = chosenView ?? defaultPhoneView(conversationCount)

  const openInfoPanel = (tab: InfoTab = 'media') => {
    setInfoTab(tab)
    setShowInfo(true)
  }

  // The conversation is loaded here only (App.tsx doesn't), and its realtime channel is joined once.
  useEffect(() => {
    if (userId) loadConversation(userId)
  }, [userId, loadConversation])
  useConversationRealtime()

  // Shared status definitions: loaded and kept live once for the whole app.
  useEffect(() => {
    if (!userId) return
    const { load, subscribe } = useStatusStore.getState()
    const stop = subscribe()
    void load()
    return stop
  }, [userId])

  const conversationId = conversation?.id ?? null

  // Reset reply and info panel when the space changes
  useEffect(() => {
    setReplyTo(null)
    setShowInfo(false)
  }, [activeSpace, conversationId])

  const noConversation = (
    <div className="flex flex-1 items-center justify-center">
      <div className="text-center text-muted">
        {conversationLoading ? (
          <p className="text-sm">Loading...</p>
        ) : (
          <>
            <p className="text-lg font-semibold">No conversation yet</p>
            <p className="mt-1 text-sm">Nobody has added you to a conversation.</p>
          </>
        )}
      </div>
    </div>
  )

  const chatColumn = (mobileBack?: () => void) =>
    conversationId ? (
      <>
        <ChatHeader isDesktop={isDesktop} onBack={mobileBack} onOpenPanel={openInfoPanel} />
        <ReconnectBar />
        <MessageList key={`list:${activeSpace}`} conversationId={conversationId} space={activeSpace} onSetReply={setReplyTo} />
        <MessageInput
          key={`input:${activeSpace}`}
          conversationId={conversationId}
          space={activeSpace}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
        />
      </>
    ) : (
      <>
        {mobileBack && <PhoneBar onBack={mobileBack} />}
        {noConversation}
      </>
    )

  return (
    <div
      data-app-shell
      data-layout={isDesktop ? 'desktop' : 'phone'}
      className="flex h-full flex-col overflow-hidden"
      // iOS doesn't shrink the layout viewport for the keyboard; fit the app to what's visible.
      style={keyboardHeight !== null ? { height: keyboardHeight } : undefined}
    >
      {isDesktop ? (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <LeftColumn onSearch={() => openInfoPanel('search')} />
          <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-primary">{chatColumn()}</main>
          {showInfo && conversationId && (
            <SlideOver label="Conversation details">
              <ChannelInfoPanel
                variant="panel"
                conversationId={conversationId}
                space={activeSpace}
                initialTab={infoTab}
                onClose={() => setShowInfo(false)}
              />
            </SlideOver>
          )}
        </div>
      ) : phoneView === 'chat' ? (
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-primary">
          {chatColumn(() => setChosenView('list'))}
        </main>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-secondary">
          <div className="flex-shrink-0 pt-safe" style={{ paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' }}>
            <MeRow />
          </div>
          <div
            className="min-h-0 flex-1 overflow-y-auto pb-safe"
            style={{ paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' }}
          >
            <ConversationList onOpen={() => setChosenView('chat')} />
          </div>
        </div>
      )}

      {/* Phones: the info panel covers the screen. */}
      {!isDesktop && showInfo && conversationId && (
        <ChannelInfoPanel
          conversationId={conversationId}
          space={activeSpace}
          initialTab={infoTab}
          onClose={() => setShowInfo(false)}
        />
      )}

      <EepShortcutListener onActivate={() => setEepMode(true)} />
    </div>
  )
}

/** The phone header when there's no conversation to show: just the way back to the list. */
function PhoneBar({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex-shrink-0 border-b border-[color:var(--line)] bg-primary">
      <div className="pt-safe" />
      <div className="flex h-[var(--header-height)] items-center px-3">
        <button onClick={onBack} className="rounded p-1 text-interactive hover:text-interactive-hover" aria-label="Back to chats">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      </div>
    </div>
  )
}

/**
 * The visible height while the on-screen keyboard is open (phones), else null. iOS keeps the layout
 * viewport full height under the keyboard, so the app is sized to the visual viewport instead.
 */
function useKeyboardHeight(enabled: boolean): number | null {
  const [height, setHeight] = useState<number | null>(null)
  useEffect(() => {
    const vv = window.visualViewport
    if (!enabled || !vv) {
      setHeight(null)
      return
    }
    const onResize = () => setHeight(vv.height < window.innerHeight - 100 ? Math.round(vv.height) : null)
    onResize()
    vv.addEventListener('resize', onResize)
    return () => vv.removeEventListener('resize', onResize)
  }, [enabled])
  return height
}

/** Ctrl+Shift+E, or Esc twice within half a second, shows the disguise. */
function EepShortcutListener({ onActivate }: { onActivate: () => void }) {
  const lastEscapeRef = useRef(0)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'E') {
        e.preventDefault()
        onActivate()
        return
      }
      if (e.key === 'Escape') {
        const now = Date.now()
        if (now - lastEscapeRef.current < 500) {
          onActivate()
          lastEscapeRef.current = 0
        } else {
          lastEscapeRef.current = now
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onActivate])

  return null
}
