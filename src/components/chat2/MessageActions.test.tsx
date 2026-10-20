import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Copy, Reply } from 'lucide-react'

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }))

vi.mock('@/lib/supabase', () => {
  const channel = { on: () => channel, subscribe: () => channel }
  return {
    supabase: {
      rpc: mockRpc,
      from: () => ({ select: () => Promise.resolve({ data: [], error: null }) }),
      channel: () => channel,
      removeChannel: () => {},
    },
  }
})
vi.mock('@/lib/emoji/data', async (orig) => ({
  ...(await orig<typeof import('@/lib/emoji/data')>()),
  loadEmoji: () => Promise.resolve([{ emoji: '🥰', label: 'smiling face with hearts', tags: [], tab: 'smileys' }]),
}))

import { ActionSheet, HoverToolbar, MessageActions } from '@/components/chat2/MessageActions'
import { buildActions, type ActionItem } from '@/components/chat2/messageActionItems'
import { LONG_PRESS_MS } from '@/hooks/useLongPress'
import { useAuthStore } from '@/stores/authStore'
import { useComposerStore } from '@/stores/composerStore'
import { useMessageStore } from '@/stores/messageStore'
import { useReactionStore } from '@/stores/reactionStore'
import type { Attachment, Message } from '@/types'

const KEY = 'conv-1:main'

const image = (name: string, spoiler = false): Attachment => ({ url: `${name}.png`, type: 'image', filename: `${name}.png`, size: 1, spoiler })

function msg(overrides: Partial<Message> = {}): Message {
  return {
    id: 'm1',
    conversation_id: 'conv-1',
    space: 'main',
    channel_id: null,
    session_id: 's1',
    author_id: 'me',
    content: 'hello there',
    attachments: [],
    type: 'text',
    edited_at: null,
    deleted: false,
    reply_to: null,
    created_at: '2026-10-19T10:00:00Z',
    ...overrides,
  }
}

const handlers = () => ({
  reply: vi.fn(),
  copy: vi.fn(),
  edit: vi.fn(),
  pin: vi.fn(),
  unpin: vi.fn(),
  spoiler: vi.fn(),
  remove: vi.fn(),
})

const labels = (items: ActionItem[]) => items.map((i) => i.label)

describe('buildActions', () => {
  it('my text message: Reply, Copy, Edit, Pin, Delete (asks first, red)', () => {
    const items = buildActions({ message: msg(), mine: true, pinned: false, mediaIndex: null, on: handlers() })
    expect(labels(items)).toEqual(['Reply', 'Copy text', 'Edit', 'Pin', 'Delete'])
    const del = items[items.length - 1]
    expect(del.danger).toBe(true)
    expect(del.confirm).toBeTruthy()
  })

  it("their message: no Edit or Delete; pinned shows Unpin", () => {
    const on = handlers()
    const items = buildActions({ message: msg(), mine: false, pinned: true, mediaIndex: null, on })
    expect(labels(items)).toEqual(['Reply', 'Copy text', 'Unpin'])
    items[2].run()
    expect(on.unpin).toHaveBeenCalled()
  })

  it('no Copy (or Edit) without text', () => {
    const items = buildActions({ message: msg({ content: null, attachments: [image('a')] }), mine: true, pinned: false, mediaIndex: null, on: handlers() })
    expect(labels(items)).not.toContain('Copy text')
    expect(labels(items)).not.toContain('Edit')
  })

  it('a pressed photo gets Mark as spoiler / Remove spoiler, for that index only', () => {
    const on = handlers()
    const message = msg({ content: null, attachments: [image('a'), image('b', true)] })
    const mark = buildActions({ message, mine: false, pinned: false, mediaIndex: 0, on })
    expect(labels(mark)).toContain('Mark as spoiler')
    mark.find((i) => i.label === 'Mark as spoiler')!.run()
    expect(on.spoiler).toHaveBeenCalledWith(0, true)

    const remove = buildActions({ message, mine: false, pinned: false, mediaIndex: 1, on })
    expect(labels(remove)).toContain('Remove spoiler')
    remove.find((i) => i.label === 'Remove spoiler')!.run()
    expect(on.spoiler).toHaveBeenCalledWith(1, false)
  })

  it('no press point (keyboard, toolbar): one spoiler item per photo, numbered when there are several', () => {
    const one = buildActions({ message: msg({ attachments: [image('a')] }), mine: false, pinned: false, mediaIndex: null, on: handlers() })
    expect(labels(one).filter((l) => /spoiler/.test(l))).toEqual(['Mark as spoiler'])
    const two = buildActions({ message: msg({ attachments: [image('a'), image('b', true)] }), mine: false, pinned: false, mediaIndex: null, on: handlers() })
    expect(labels(two).filter((l) => /spoiler/.test(l))).toEqual(['Mark item 1 as spoiler', 'Remove spoiler from item 2'])
  })

  it('files never get a spoiler item', () => {
    const file: Attachment = { url: 'x.zip', type: 'file', filename: 'x.zip', size: 1, spoiler: false }
    const items = buildActions({ message: msg({ attachments: [file] }), mine: false, pinned: false, mediaIndex: 0, on: handlers() })
    expect(labels(items).some((l) => /spoiler/.test(l))).toBe(false)
  })
})

const sample = (run = vi.fn(), remove = vi.fn()): ActionItem[] => [
  { id: 'reply', label: 'Reply', icon: Reply, run },
  { id: 'copy', label: 'Copy text', icon: Copy, run: vi.fn() },
  { id: 'delete', label: 'Delete', icon: Copy, run: remove, danger: true, confirm: { title: 'Delete this message?', action: 'Delete' } },
]

describe('ActionSheet', () => {
  it('lists the actions in a dialog; choosing one runs it and closes', () => {
    const run = vi.fn()
    const onClose = vi.fn()
    render(<ActionSheet actions={sample(run)} onClose={onClose} />)
    const sheet = screen.getByRole('dialog', { name: 'Message actions' })
    expect(sheet).toHaveClass('sheet-up')
    expect(within(sheet).getAllByRole('button').map((b) => b.textContent)).toEqual(['Reply', 'Copy text', 'Delete'])
    fireEvent.click(within(sheet).getByRole('button', { name: 'Reply' }))
    expect(run).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('Delete asks first: Cancel goes back, Delete deletes', () => {
    const remove = vi.fn()
    const onClose = vi.fn()
    render(<ActionSheet actions={sample(vi.fn(), remove)} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(remove).not.toHaveBeenCalled()
    expect(screen.getByText('Delete this message?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'Reply' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(remove).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('closes on Escape and on the dimmed backdrop', () => {
    const onClose = vi.fn()
    render(<ActionSheet actions={sample()} onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByTestId('sheet-backdrop'))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('focuses the first action when it opens', () => {
    render(<ActionSheet actions={sample()} onClose={() => {}} />)
    expect(screen.getByRole('button', { name: 'Reply' })).toHaveFocus()
  })
})

describe('HoverToolbar', () => {
  it('has React, Reply and More actions', () => {
    const onReact = vi.fn()
    const onReply = vi.fn()
    render(<HoverToolbar side="them" onReact={onReact} onReply={onReply} actions={sample()} />)
    const bar = screen.getByRole('toolbar', { name: 'Message actions' })
    fireEvent.click(within(bar).getByRole('button', { name: 'React' }))
    expect(onReact).toHaveBeenCalled()
    fireEvent.click(within(bar).getByRole('button', { name: 'Reply' }))
    expect(onReply).toHaveBeenCalled()
  })

  it('More actions opens a menu; an item runs and closes it; Escape closes it', () => {
    const run = vi.fn()
    render(<HoverToolbar side="them" onReact={() => {}} onReply={() => {}} actions={sample(run)} />)
    const more = screen.getByRole('button', { name: 'More actions' })
    fireEvent.click(more)
    const menu = screen.getByRole('menu')
    expect(within(menu).getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['Reply', 'Copy text', 'Delete'])
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Reply' }))
    expect(run).toHaveBeenCalled()
    expect(screen.queryByRole('menu')).toBeNull()

    fireEvent.click(more)
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('Delete in the menu asks first', () => {
    const remove = vi.fn()
    render(<HoverToolbar side="me" onReact={() => {}} onReply={() => {}} actions={sample(vi.fn(), remove)} />)
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    expect(remove).not.toHaveBeenCalled()
    expect(screen.getByText('Delete this message?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    expect(remove).toHaveBeenCalled()
  })
})

describe('MessageActions', () => {
  const props = (overrides: Partial<React.ComponentProps<typeof MessageActions>> = {}) => ({
    message: msg(),
    mine: true,
    pinned: false,
    spaceKey: KEY,
    isDesktop: false,
    emoji: () => undefined,
    onSetReply: vi.fn(),
    onPin: vi.fn(),
    onUnpin: vi.fn(),
    onBroadcastDelete: vi.fn(),
    onNotice: vi.fn(),
    ...overrides,
  })

  beforeEach(() => {
    useComposerStore.setState({ editing: null })
    useAuthStore.setState({ user: { id: 'me' } as never })
    mockRpc.mockReset()
  })
  afterEach(() => vi.useRealTimers())

  const bubble = (
    <div data-bubble>
      hello there
      <div data-media-index="1">
        <button type="button">Open b.png</button>
      </div>
    </div>
  )

  it('R replies and E edits (mine) when the row itself has focus, not when typing inside it', () => {
    const p = props({ isDesktop: true })
    render(
      <MessageActions {...p}>
        {bubble}
        <textarea aria-label="inner" />
      </MessageActions>,
    )
    const row = screen.getByRole('group', { name: 'Message' })
    expect(row).toHaveAttribute('tabindex', '0')
    fireEvent.keyDown(screen.getByLabelText('inner'), { key: 'r' })
    expect(p.onSetReply).not.toHaveBeenCalled()
    fireEvent.keyDown(row, { key: 'r' })
    expect(p.onSetReply).toHaveBeenCalledWith(p.message)
    fireEvent.keyDown(row, { key: 'e' })
    expect(useComposerStore.getState().editing?.id).toBe('m1')
  })

  it("E does nothing on their message", () => {
    render(<MessageActions {...props({ mine: false, isDesktop: true })}>{bubble}</MessageActions>)
    fireEvent.keyDown(screen.getByRole('group', { name: 'Message' }), { key: 'e' })
    expect(useComposerStore.getState().editing).toBeNull()
  })

  it('phones: a "More actions" button opens the sheet from the keyboard; Edit goes to the composer store', () => {
    render(<MessageActions {...props()}>{bubble}</MessageActions>)
    expect(screen.queryByRole('toolbar', { name: 'Message actions' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Message actions' })).getByRole('button', { name: 'Edit' }))
    expect(useComposerStore.getState().editing?.id).toBe('m1')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('phones: a long-press lifts the bubble, shows the quick bar above and the sheet, spoiler for the pressed photo', async () => {
    vi.useFakeTimers()
    const message = msg({ attachments: [image('a'), image('b')] })
    useMessageStore.setState({ messages: { [KEY]: [message] } })
    mockRpc.mockResolvedValue({ data: null, error: null })
    render(<MessageActions {...props({ message, mine: false })}>{bubble}</MessageActions>)
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Open b.png' }), { pointerType: 'touch', clientX: 5, clientY: 5 })
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS))
    expect(document.querySelector('[data-lifted]')).not.toBeNull()
    expect(screen.getByRole('toolbar', { name: 'Quick reactions' })).toBeInTheDocument()
    const sheet = screen.getByRole('dialog', { name: 'Message actions' })
    expect(within(sheet).getAllByRole('button').map((b) => b.textContent)).toEqual(['Reply', 'Copy text', 'Pin', 'Mark as spoiler'])
    fireEvent.click(within(sheet).getByRole('button', { name: 'Mark as spoiler' }))
    expect(mockRpc).toHaveBeenCalledWith('set_attachment_spoiler', { p_message: 'm1', p_index: 1, p_spoiler: true })
    expect(useMessageStore.getState().messages[KEY][0].attachments[1].spoiler).toBe(true)
  })

  it('a failed spoiler change rolls back and says so', async () => {
    const message = msg({ attachments: [image('a')] })
    useMessageStore.setState({ messages: { [KEY]: [message] } })
    mockRpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'no' } })
    const p = props({ message, mine: false })
    render(<MessageActions {...p}>{bubble}</MessageActions>)
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Mark as spoiler' }))
    })
    expect(useMessageStore.getState().messages[KEY][0].attachments[0].spoiler).toBe(false)
    expect(p.onNotice).toHaveBeenCalledWith("Couldn't change the spoiler")
  })

  it('desktop: the hover toolbar shows on hover, and React picks from the quick bar into the reaction store', () => {
    const toggle = vi.fn()
    useReactionStore.setState({ toggle } as never)
    render(<MessageActions {...props({ isDesktop: true })}>{bubble}</MessageActions>)
    expect(screen.queryByRole('toolbar', { name: 'Message actions' })).toBeNull()
    fireEvent.pointerEnter(screen.getByRole('group', { name: 'Message' }))
    fireEvent.click(screen.getByRole('button', { name: 'React' }))
    fireEvent.click(screen.getByRole('button', { name: 'React with 😂' }))
    expect(toggle).toHaveBeenCalledWith('m1', '😂', 'me')
  })

  it('desktop: React → More emoji → an emoji in the full picker sends the reaction', async () => {
    const toggle = vi.fn()
    useReactionStore.setState({ toggle } as never)
    render(<MessageActions {...props({ isDesktop: true })}>{bubble}</MessageActions>)
    fireEvent.pointerEnter(screen.getByRole('group', { name: 'Message' }))
    fireEvent.click(screen.getByRole('button', { name: 'React' }))
    fireEvent.click(screen.getByRole('button', { name: 'More emoji' }))
    await act(async () => {})
    const emoji = within(screen.getByRole('dialog', { name: 'Emoji picker' })).getByRole('button', { name: 'smiling face with hearts' })
    fireEvent.pointerDown(emoji)
    fireEvent.click(emoji)
    expect(toggle).toHaveBeenCalledWith('m1', '🥰', 'me')
    expect(screen.queryByRole('dialog', { name: 'Emoji picker' })).toBeNull()
  })

  it('phones: from the long-press quick bar, More emoji picks a reaction and closes everything; Esc closes only the picker', async () => {
    vi.useFakeTimers()
    const toggle = vi.fn()
    useReactionStore.setState({ toggle } as never)
    render(<MessageActions {...props({ mine: false })}>{bubble}</MessageActions>)
    fireEvent.pointerDown(screen.getByText('hello there'), { pointerType: 'touch', clientX: 5, clientY: 5 })
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS))
    fireEvent.click(screen.getByRole('button', { name: 'More emoji' }))
    await act(async () => {})
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Emoji picker' })).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Message actions' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'More emoji' }))
    await act(async () => {})
    const emoji = within(screen.getByRole('dialog', { name: 'Emoji picker' })).getByRole('button', { name: 'smiling face with hearts' })
    fireEvent.pointerDown(emoji)
    fireEvent.click(emoji)
    expect(toggle).toHaveBeenCalledWith('m1', '🥰', 'me')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('desktop: no long-press', () => {
    vi.useFakeTimers()
    render(<MessageActions {...props({ isDesktop: true })}>{bubble}</MessageActions>)
    fireEvent.pointerDown(screen.getByText('hello there'), { pointerType: 'touch' })
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
