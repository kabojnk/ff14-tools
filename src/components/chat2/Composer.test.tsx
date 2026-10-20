import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@supabase/supabase-js'

const { sendOutgoing, uploadFile, sendTyping, stopTyping, sendMessageEvent } = vi.hoisted(() => ({
  sendMessageEvent: vi.fn(),
  sendOutgoing: vi.fn(async () => {}),
  uploadFile: vi.fn(),
  sendTyping: vi.fn(),
  stopTyping: vi.fn(),
}))

vi.mock('@/lib/supabase', () => {
  const channel = { on: () => channel, subscribe: () => channel }
  return {
    supabase: {
      from: () => ({ select: () => Promise.resolve({ data: [], error: null }) }),
      channel: () => channel,
      removeChannel: () => {},
    },
  }
})
vi.mock('@/lib/emoji/data', async (orig) => ({
  ...(await orig<typeof import('@/lib/emoji/data')>()),
  loadEmoji: () => Promise.resolve([{ emoji: '😀', label: 'grinning face', tags: [], tab: 'smileys' }]),
}))
vi.mock('@/lib/chat/outbox', async (orig) => ({ ...(await orig<typeof import('@/lib/chat/outbox')>()), sendOutgoing }))
vi.mock('@/lib/conversationRealtime', async (orig) => ({
  ...(await orig<typeof import('@/lib/conversationRealtime')>()),
  sendMessageEvent,
}))
vi.mock('@/lib/bunny', async (orig) => ({ ...(await orig<typeof import('@/lib/bunny')>()), uploadFile }))
vi.mock('@/hooks/useTyping', () => ({ useTyping: () => ({ typingUsers: [], sendTyping, stopTyping }) }))

import { Composer } from '@/components/chat2/Composer'
import { useAuthStore } from '@/stores/authStore'
import { useComposerStore } from '@/stores/composerStore'
import { useConversationStore } from '@/stores/conversationStore'
import { useDraftStore } from '@/stores/draftStore'
import { useMessageStore } from '@/stores/messageStore'
import { useProfileStore } from '@/stores/profileStore'
import { useUiStore } from '@/stores/uiStore'
import type { Message, Profile } from '@/types'

function msg(overrides: Partial<Message> = {}): Message {
  return {
    id: 'm1',
    conversation_id: 'conv-1',
    space: 'main',
    channel_id: null,
    session_id: 's1',
    author_id: 'alice',
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

const dragTheLake = vi.fn(async () => {})
const editMessage = vi.fn(async (id: string, content: string, _key: string) => ({ id, content }) as unknown as Message)

function setup(props: Partial<React.ComponentProps<typeof Composer>> = {}) {
  const onCancelReply = vi.fn()
  const utils = render(<Composer conversationId="conv-1" space="main" isDesktop onCancelReply={onCancelReply} {...props} />)
  const box = screen.getByPlaceholderText('Message #Main') as HTMLTextAreaElement
  return { ...utils, box, onCancelReply }
}

const type = (box: HTMLElement, value: string) => fireEvent.change(box, { target: { value } })
const enter = (box: HTMLElement, init: KeyboardEventInit & { keyCode?: number } = {}) =>
  fireEvent.keyDown(box, { key: 'Enter', code: 'Enter', ...init })

beforeEach(() => {
  sendOutgoing.mockClear()
  uploadFile.mockReset()
  sendTyping.mockClear()
  stopTyping.mockClear()
  dragTheLake.mockClear()
  editMessage.mockClear()
  sendMessageEvent.mockClear()
  useAuthStore.setState({ user: { id: 'me' } as User })
  useConversationStore.setState({ dragTheLake })
  useMessageStore.setState({ editMessage })
  useComposerStore.setState({ editing: null })
  useDraftStore.setState({ drafts: {} })
  useUiStore.setState({ eepMode: false })
  useProfileStore.setState({ profiles: { alice: { id: 'alice', nickname: 'Alice' } as Profile } })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Composer: the field', () => {
  it('lets iOS autocorrect, capitalise and predict, with Send on the keyboard', () => {
    const { box } = setup()
    expect(box).toHaveAttribute('autocorrect', 'on')
    expect(box).toHaveAttribute('autocapitalize', 'sentences')
    expect(box).toHaveAttribute('spellcheck', 'true')
    expect(box).toHaveAttribute('enterkeyhint', 'send')
    expect(box).toHaveAttribute('inputmode', 'text')
  })

  it('shows the send button always (no mic), disabled while the field is empty', () => {
    const { box } = setup()
    const send = screen.getByRole('button', { name: 'Send' })
    expect(send).toBeDisabled()
    type(box, '   ')
    expect(send).toBeDisabled()
    type(box, 'hi')
    expect(send).toBeEnabled()
    expect(screen.queryByRole('button', { name: /voice|mic/i })).not.toBeInTheDocument()
  })

  it('keeps the typed text exactly as typed (no transforms)', () => {
    const { box } = setup()
    type(box, 'i  dont   know ')
    expect(box.value).toBe('i  dont   know ')
  })

  it('announces typing while there is text, and stops when the field is cleared', () => {
    const { box } = setup()
    type(box, 'h')
    expect(sendTyping).toHaveBeenCalled()
    type(box, '')
    expect(stopTyping).toHaveBeenCalled()
  })
})

describe('Composer: Enter and Return', () => {
  it('desktop: Enter sends the trimmed text; Shift+Enter does not', () => {
    const { box } = setup({ isDesktop: true })
    type(box, '  hello  ')
    enter(box, { shiftKey: true })
    expect(sendOutgoing).not.toHaveBeenCalled()
    enter(box)
    expect(sendOutgoing).toHaveBeenCalledWith(
      expect.objectContaining({ authorId: 'me', space: 'main', content: 'hello', attachments: [], type: 'text', replyTo: null }),
    )
    expect(box.value).toBe('')
    expect(stopTyping).toHaveBeenCalled()
  })

  it('phone: Return never sends (it adds a newline); the send button sends', () => {
    const { box } = setup({ isDesktop: false })
    type(box, 'hello')
    const ev = enter(box)
    expect(ev).toBe(true) // not prevented: the browser inserts the newline
    expect(sendOutgoing).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(sendOutgoing).toHaveBeenCalledWith(expect.objectContaining({ content: 'hello' }))
  })

  it('ignores Enter while an IME composition is in progress (isComposing)', () => {
    const { box } = setup()
    type(box, 'konnichiwa')
    enter(box, { isComposing: true })
    expect(sendOutgoing).not.toHaveBeenCalled()
  })

  it('ignores Enter with keyCode 229 (the IME is handling the key)', () => {
    const { box } = setup()
    type(box, 'konnichiwa')
    enter(box, { keyCode: 229 })
    expect(sendOutgoing).not.toHaveBeenCalled()
  })

  it('ignores Enter between compositionstart and compositionend', () => {
    const { box } = setup()
    fireEvent.compositionStart(box)
    type(box, 'konnichiwa')
    enter(box)
    expect(sendOutgoing).not.toHaveBeenCalled()
  })

  it('Safari order: compositionend then the Enter keydown in the same tick does not send; a later Enter does', async () => {
    vi.useFakeTimers()
    const { box } = setup()
    fireEvent.compositionStart(box)
    type(box, 'こんにちは')
    fireEvent.compositionEnd(box)
    enter(box) // Safari: the keydown that committed the composition arrives after compositionend
    expect(sendOutgoing).not.toHaveBeenCalled()
    expect(box.value).toBe('こんにちは')

    await act(async () => {
      vi.advanceTimersByTime(0)
    })
    enter(box)
    expect(sendOutgoing).toHaveBeenCalledWith(expect.objectContaining({ content: 'こんにちは' }))
  })
})

describe('Composer: commands, drafts and replies', () => {
  it('/eep shows the disguise and /drag drags the lake, without sending', () => {
    const { box } = setup()
    type(box, '/drag')
    enter(box)
    expect(dragTheLake).toHaveBeenCalled()
    type(box, '/eep')
    enter(box)
    expect(useUiStore.getState().eepMode).toBe(true)
    expect(sendOutgoing).not.toHaveBeenCalled()
    expect(stopTyping).toHaveBeenCalled()
  })

  it('keeps the draft per space across a remount', () => {
    const first = setup()
    type(first.box, 'half typed')
    first.unmount()
    const second = setup()
    expect(second.box.value).toBe('half typed')
    second.unmount()
    render(<Composer conversationId="conv-1" space="schist" isDesktop />)
    expect(screen.getByPlaceholderText('Message #Schist')).toHaveValue('')
  })

  it('a reply shows who it answers, sends reply_to and then clears', () => {
    const { box, onCancelReply } = setup({ replyTo: msg() })
    expect(screen.getByText('Replying to')).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()
    type(box, 'yes!')
    enter(box)
    expect(sendOutgoing).toHaveBeenCalledWith(expect.objectContaining({ content: 'yes!', replyTo: 'm1' }))
    expect(onCancelReply).toHaveBeenCalled()
  })

  it('the reply can be cancelled', () => {
    const { onCancelReply } = setup({ replyTo: msg() })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel reply' }))
    expect(onCancelReply).toHaveBeenCalled()
  })
})

describe('Composer: editing', () => {
  const mine = msg({ id: 'mine', author_id: 'me', content: 'old text' })

  it('Edit puts the message in the field under an "Editing message" bar; Enter saves (desktop)', async () => {
    const { box } = setup()
    type(box, 'my draft')
    act(() => useComposerStore.getState().startEdit(mine))
    expect(screen.getByText('Editing message')).toBeInTheDocument()
    const editor = screen.getByRole('textbox', { name: 'Edit message' })
    expect(editor).toHaveValue('old text')
    expect(editor).toHaveFocus()

    type(editor, 'new text')
    await act(async () => {
      enter(editor)
    })
    expect(editMessage).toHaveBeenCalledWith('mine', 'new text', 'conv-1:main')
    expect(sendMessageEvent).toHaveBeenCalledWith('edit', { id: 'mine', content: 'new text' })
    expect(sendOutgoing).not.toHaveBeenCalled()
    expect(useComposerStore.getState().editing).toBeNull()
    expect(screen.queryByText('Editing message')).not.toBeInTheDocument()
    // The draft comes back.
    expect(box).toHaveValue('my draft')
  })

  it('Esc cancels the edit without saving and restores the draft', () => {
    const { box } = setup()
    type(box, 'my draft')
    act(() => useComposerStore.getState().startEdit(mine))
    const editor = screen.getByRole('textbox', { name: 'Edit message' })
    type(editor, 'changed my mind')
    fireEvent.keyDown(editor, { key: 'Escape' })
    expect(editMessage).not.toHaveBeenCalled()
    expect(useComposerStore.getState().editing).toBeNull()
    expect(box).toHaveValue('my draft')
    expect(screen.queryByRole('textbox', { name: 'Edit message' })).not.toBeInTheDocument()
  })

  it('phone: the round button saves the edit', async () => {
    setup({ isDesktop: false })
    act(() => useComposerStore.getState().startEdit(mine))
    const editor = screen.getByRole('textbox', { name: 'Edit message' })
    type(editor, 'fixed')
    enter(editor)
    expect(editMessage).not.toHaveBeenCalled()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save edit' }))
    })
    expect(editMessage).toHaveBeenCalledWith('mine', 'fixed', 'conv-1:main')
  })

  it('an unchanged or emptied edit just closes', async () => {
    setup()
    act(() => useComposerStore.getState().startEdit(mine))
    await act(async () => {
      enter(screen.getByRole('textbox', { name: 'Edit message' }))
    })
    expect(editMessage).not.toHaveBeenCalled()
    expect(useComposerStore.getState().editing).toBeNull()
  })

  it('does not announce typing while editing', () => {
    setup()
    act(() => useComposerStore.getState().startEdit(mine))
    sendTyping.mockClear()
    type(screen.getByRole('textbox', { name: 'Edit message' }), 'x')
    expect(sendTyping).not.toHaveBeenCalled()
  })
})

describe('Composer: emoji', () => {
  const pickerEmoji = () => within(screen.getByRole('dialog', { name: 'Emoji picker' })).getByRole('button', { name: 'grinning face' })
  const caretAt = (box: HTMLTextAreaElement, at: number) => {
    box.setSelectionRange(at, at)
    fireEvent.select(box)
  }

  it('phone: inserts at the caret without focusing the field (the keyboard stays down), and keeps picking', async () => {
    const { box } = setup({ isDesktop: false })
    type(box, 'abcd')
    caretAt(box, 2)
    fireEvent.blur(box)
    fireEvent.click(screen.getByRole('button', { name: 'Pick an emoji' }))
    await act(async () => {})
    fireEvent.click(pickerEmoji())
    fireEvent.click(pickerEmoji())
    expect(box.value).toBe('ab😀😀cd')
    expect(box.selectionStart).toBe('ab😀😀'.length)
    expect(box.selectionEnd).toBe('ab😀😀'.length)
    expect(box).not.toHaveFocus()
    expect(screen.getByRole('dialog', { name: 'Emoji picker' })).toBeInTheDocument()
  })

  it('phone: the panel sits in the layout below the composer, not over it', async () => {
    const { container, box } = setup({ isDesktop: false })
    fireEvent.click(screen.getByRole('button', { name: 'Pick an emoji' }))
    await act(async () => {})
    const picker = screen.getByRole('dialog', { name: 'Emoji picker' })
    expect(picker.previousElementSibling).toBe(container.querySelector('[data-composer]'))
    // Tapping into the field brings the keyboard back instead.
    fireEvent.focus(box)
    expect(screen.queryByRole('dialog', { name: 'Emoji picker' })).toBeNull()
  })

  it('desktop: inserts at the caret, replacing a selection, and puts the caret after it', async () => {
    const { box } = setup()
    type(box, 'hello world')
    box.setSelectionRange(6, 11)
    fireEvent.select(box)
    fireEvent.click(screen.getByRole('button', { name: 'Pick an emoji' }))
    await act(async () => {})
    fireEvent.click(pickerEmoji())
    expect(box.value).toBe('hello 😀')
    expect(box).toHaveFocus()
    expect(box.selectionStart).toBe('hello 😀'.length)
  })

  it('inserts into the message being edited', async () => {
    useComposerStore.setState({ editing: msg({ author_id: 'me', content: 'hi' }) })
    setup()
    const box = screen.getByRole('textbox', { name: 'Edit message' }) as HTMLTextAreaElement
    caretAt(box, 2)
    fireEvent.click(screen.getByRole('button', { name: 'Pick an emoji' }))
    await act(async () => {})
    fireEvent.click(pickerEmoji())
    expect(box.value).toBe('hi😀')
  })

  it('Escape with the picker open closes it, not the edit', async () => {
    useComposerStore.setState({ editing: msg({ author_id: 'me', content: 'hi' }) })
    setup()
    const box = screen.getByRole('textbox', { name: 'Edit message' })
    fireEvent.click(screen.getByRole('button', { name: 'Pick an emoji' }))
    await act(async () => {})
    fireEvent.keyDown(box, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Emoji picker' })).toBeNull()
    expect(useComposerStore.getState().editing).not.toBeNull()
  })
})

describe('Composer: attachments', () => {
  const file = () => new File(['x'], 'cat.png', { type: 'image/png' })

  it('uploads a chosen file into the tray, then sends it with the spoiler flag', async () => {
    let resolve!: (v: unknown) => void
    uploadFile.mockReturnValue(new Promise((r) => (resolve = r)))
    setup()
    fireEvent.change(screen.getByLabelText('Files to attach'), { target: { files: [file()] } })
    expect(screen.getByRole('progressbar', { name: 'Uploading cat.png' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()

    await act(async () => {
      resolve({ url: 'http://cdn/cat.png', filename: 'cat.png', size: 68, type: 'image/png' })
    })
    fireEvent.click(screen.getByRole('button', { name: 'Spoiler cat.png' }))
    const send = screen.getByRole('button', { name: 'Send' })
    expect(send).toBeEnabled()
    fireEvent.click(send)
    expect(sendOutgoing).toHaveBeenCalledWith(
      expect.objectContaining({
        content: null,
        attachments: [{ url: 'http://cdn/cat.png', type: 'image', filename: 'cat.png', size: 68, spoiler: true }],
      }),
    )
    expect(screen.queryByRole('list', { name: 'Attachments' })).not.toBeInTheDocument()
  })

  it('a failed upload can be retried', async () => {
    uploadFile.mockRejectedValueOnce(new Error('nope'))
    setup()
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Files to attach'), { target: { files: [file()] } })
    })
    expect(screen.getByText('Upload failed')).toBeInTheDocument()
    uploadFile.mockResolvedValueOnce({ url: 'http://cdn/cat.png', filename: 'cat.png', size: 68, type: 'image/png' })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Retry cat.png' }))
    })
    expect(screen.queryByText('Upload failed')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled()
  })
})
