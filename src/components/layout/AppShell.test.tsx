import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), channel: vi.fn(), removeChannel: vi.fn() } }))
vi.mock('@/hooks/useConversationRealtime', () => ({ useConversationRealtime: () => {} }))
vi.mock('@/hooks/useKeyboardViewport', () => ({ useKeyboardViewport: () => null }))

// The chat's parts have their own tests; here they only need to show which screen is up.
vi.mock('@/components/chat2/ChatHeader', () => ({
  ChatHeader: ({ onBack }: { onBack?: () => void }) => (
    <header>
      {onBack && (
        <button type="button" onClick={onBack}>
          Back to chats
        </button>
      )}
    </header>
  ),
}))
vi.mock('@/components/chat2/ReconnectBar', () => ({ ReconnectBar: () => null }))
// With a portalled child, as the photo viewer is: React bubbles its events to the list's parents.
vi.mock('@/components/chat2/MessageList', async () => {
  const { createPortal } = await import('react-dom')
  return {
    MessageList: () => (
      <div data-testid="messages">
        Messages
        {createPortal(<div data-testid="portalled">Viewer</div>, document.body)}
      </div>
    ),
  }
})
vi.mock('@/components/chat2/Composer', () => ({ Composer: () => <textarea aria-label="Message" /> }))
vi.mock('@/components/chat/ChannelInfoPanel', () => ({ ChannelInfoPanel: () => null }))
vi.mock('@/components/layout/LeftColumn', () => ({ LeftColumn: () => <nav>Left column</nav> }))
vi.mock('@/components/layout/MeRow', () => ({ MeRow: () => <div>Me row</div> }))
vi.mock('@/components/layout/ConversationList', () => ({
  ConversationList: ({ onOpen }: { onOpen: () => void }) => (
    <button type="button" onClick={onOpen}>
      Open conversation
    </button>
  ),
}))

import { AppShell } from '@/components/layout/AppShell'
import { EXIT_MS } from '@/hooks/useSwipeBack'
import { useAuthStore } from '@/stores/authStore'
import { useConversationStore } from '@/stores/conversationStore'
import { useStatusStore } from '@/stores/statusStore'
import { useUiStore } from '@/stores/uiStore'
import { drag, path } from '@/test/touch'

function stubMatchMedia(desktop: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('min-width: 900px') ? desktop : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

const swipeFromEdge = (from: Element = screen.getByTestId('messages')) => {
  drag(from, path([6, 400], [500, 410]))
  act(() => vi.advanceTimersByTime(EXIT_MS))
}

beforeEach(() => {
  vi.useFakeTimers()
  stubMatchMedia(false)
  useAuthStore.setState({ user: { id: 'me' } } as never)
  useConversationStore.setState({ conversation: { id: 'c1' }, loading: false, activeSpace: 'main', load: vi.fn() } as never)
  useStatusStore.setState({ load: vi.fn(async () => {}), subscribe: vi.fn(() => () => {}) } as never)
  useUiStore.setState({ eepMode: false })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('AppShell swipe back (phones)', () => {
  it('a swipe right from the left edge of the chat goes to the conversation list, like Back', () => {
    render(<AppShell />)
    expect(screen.getByTestId('messages')).toBeInTheDocument()
    swipeFromEdge()
    expect(screen.queryByTestId('messages')).toBeNull()
    expect(screen.getByText('Me row')).toBeInTheDocument()

    // And into the chat again: the swipe still works on the new <main>.
    fireEvent.click(screen.getByRole('button', { name: 'Open conversation' }))
    swipeFromEdge()
    expect(screen.getByText('Me row')).toBeInTheDocument()
  })

  it('not from the middle of the screen', () => {
    render(<AppShell />)
    drag(screen.getByTestId('messages'), path([120, 400], [600, 400]))
    act(() => vi.advanceTimersByTime(1000))
    expect(screen.getByTestId('messages')).toBeInTheDocument()
  })

  it('not while a sheet, viewer or menu is open over the chat, nor under the PinPad', () => {
    render(<AppShell />)
    for (const attr of ['aria-modal', 'data-pin-pad']) {
      const layer = document.createElement('div')
      layer.setAttribute(attr, attr === 'aria-modal' ? 'true' : '')
      document.body.appendChild(layer)
      swipeFromEdge()
      expect(screen.getByTestId('messages')).toBeInTheDocument()
      layer.remove()
    }
    const menu = document.createElement('div')
    menu.setAttribute('role', 'menu')
    document.body.appendChild(menu)
    swipeFromEdge()
    expect(screen.getByTestId('messages')).toBeInTheDocument()
    menu.remove()
  })

  it('a touch on something portalled out of the chat (the photo viewer) does not move it', () => {
    render(<AppShell />)
    swipeFromEdge(screen.getByTestId('portalled'))
    expect(screen.getByTestId('messages')).toBeInTheDocument()
  })

  it('desktop: no swipe', () => {
    stubMatchMedia(true)
    render(<AppShell />)
    swipeFromEdge()
    expect(screen.getByTestId('messages')).toBeInTheDocument()
    expect(screen.getByText('Left column')).toBeInTheDocument()
  })
})
