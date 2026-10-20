import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { loadEmoji, remove } = vi.hoisted(() => ({ loadEmoji: vi.fn(), remove: vi.fn() }))

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
vi.mock('@/lib/emoji/data', async (orig) => ({ ...(await orig<typeof import('@/lib/emoji/data')>()), loadEmoji }))

import { EmojiPicker, type EmojiPickerProps } from '@/components/emoji/EmojiPicker'
import type { StandardEmoji } from '@/lib/emoji/data'
import { LONG_PRESS_MS } from '@/hooks/useLongPress'
import { noteRecentEmoji, recentEmojiList } from '@/lib/recentEmoji'
import { useEmojiStore } from '@/stores/emojiStore'
import { useProfileStore } from '@/stores/profileStore'
import type { CustomEmoji, Profile } from '@/types'

// jsdom has no PointerEvent, so fireEvent would drop pointerType.
if (typeof window.PointerEvent === 'undefined') {
  class PointerEventShim extends MouseEvent {
    pointerType: string
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init)
      this.pointerType = init.pointerType ?? ''
    }
  }
  window.PointerEvent = PointerEventShim as unknown as typeof PointerEvent
}

const DATA: StandardEmoji[] = [
  { emoji: '😀', label: 'grinning face', tags: ['grin'], tab: 'smileys' },
  { emoji: '😢', label: 'crying face', tags: ['cry', 'sad'], tab: 'smileys' },
  { emoji: '🐵', label: 'monkey face', tags: ['monkey'], tab: 'nature' },
  { emoji: '❤️', label: 'red heart', tags: ['love'], tab: 'symbols' },
  { emoji: '🏁', label: 'chequered flag', tags: ['racing'], tab: 'flags' },
]

const row = (name: string, over: Partial<CustomEmoji> = {}): CustomEmoji => ({
  id: `id-${name}`,
  name,
  image_url: `/${name}.png`,
  uploaded_by: 'alice',
  created_at: '2026-09-12T10:00:00Z',
  ...over,
})

function setRows(rows: CustomEmoji[]) {
  const byName = Object.fromEntries(rows.map((r) => [r.name, r.image_url]))
  useEmojiStore.setState({ rows, byName, lookup: (n) => byName[n], loaded: true, remove })
}

function setup(props: Partial<EmojiPickerProps> = {}) {
  const onPick = vi.fn()
  const onClose = vi.fn()
  const utils = render(<EmojiPicker mode="composer" onPick={onPick} onClose={onClose} isDesktop {...props} />)
  return { ...utils, onPick, onClose }
}

const ready = () => act(async () => {})

beforeEach(() => {
  loadEmoji.mockReset().mockResolvedValue(DATA)
  remove.mockReset().mockResolvedValue({ error: null })
  setRows([row('wipe_cry'), row('moogle', { uploaded_by: null })])
  useProfileStore.setState({ profiles: { alice: { id: 'alice', nickname: 'Alice' } as Profile } })
  Element.prototype.scrollTo = vi.fn()
})
afterEach(() => vi.useRealTimers())

describe('EmojiPicker', () => {
  it('shows the ten category tabs and the sections, with standard emoji named by label', async () => {
    setup()
    await ready()
    const tabs = within(screen.getByRole('tablist', { name: 'Emoji categories' })).getAllByRole('tab')
    expect(tabs.map((t) => t.getAttribute('aria-label'))).toEqual([
      'Recent',
      'Custom',
      'Smileys & people',
      'Nature',
      'Food & drink',
      'Activities',
      'Travel & places',
      'Objects',
      'Symbols',
      'Flags',
    ])
    expect(within(screen.getByRole('region', { name: 'Nature' })).getByRole('button', { name: 'monkey face' })).toHaveTextContent('🐵')
    expect(within(screen.getByRole('region', { name: 'Custom' })).getByRole('button', { name: ':moogle:' })).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Search emoji' })).toHaveFocus()
  })

  it('a tab scrolls the list to its section and becomes selected', async () => {
    setup()
    await ready()
    const section = screen.getByRole('region', { name: 'Flags' })
    section.getBoundingClientRect = () => ({ top: 300 }) as DOMRect
    fireEvent.click(screen.getByRole('tab', { name: 'Flags' }))
    expect(Element.prototype.scrollTo).toHaveBeenCalledWith({ top: 300 })
    expect(screen.getByRole('tab', { name: 'Flags' })).toHaveAttribute('aria-selected', 'true')
  })

  it('shows a skeleton while loading, then "Couldn’t load emoji" with Retry; Recent and Custom work without it', async () => {
    loadEmoji.mockRejectedValueOnce(new Error('chunk')).mockResolvedValueOnce(DATA)
    noteRecentEmoji('😀')
    setup()
    expect(screen.getByRole('status', { name: 'Loading emoji' })).toBeInTheDocument()
    await ready()
    expect(screen.getByText('Couldn’t load emoji')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Recent' })).getByRole('button', { name: '😀' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: ':wipe_cry:' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await ready()
    expect(within(screen.getByRole('region', { name: 'Smileys & people' })).getByRole('button', { name: 'grinning face' })).toBeInTheDocument()
    // Labels arrive with the dataset.
    expect(within(screen.getByRole('region', { name: 'Recent' })).getByRole('button', { name: 'grinning face' })).toBeInTheDocument()
  })

  it('search shows custom matches first, then standard; nothing found says so', async () => {
    setup()
    await ready()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search emoji' }), { target: { value: 'cry' } })
    const hits = within(screen.getByRole('group', { name: 'Search results' })).getAllByRole('button')
    expect(hits.map((b) => b.getAttribute('aria-label'))).toEqual([':wipe_cry:', 'crying face'])
    expect(screen.queryByRole('region', { name: 'Nature' })).toBeNull()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search emoji' }), { target: { value: 'xyz' } })
    expect(screen.getByText('No emoji match “xyz”')).toBeInTheDocument()
  })

  it('picking calls onPick and records it as recent (custom as :name:); the composer stays open', async () => {
    const { onPick, onClose } = setup()
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'red heart' }))
    fireEvent.click(screen.getByRole('button', { name: ':moogle:' }))
    expect(onPick.mock.calls).toEqual([['❤️'], [':moogle:']])
    expect(recentEmojiList()).toEqual([':moogle:', '❤️'])
    expect(onClose).not.toHaveBeenCalled()
  })

  it('reaction mode closes after a pick', async () => {
    const { onPick, onClose } = setup({ mode: 'reaction' })
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'grinning face' }))
    expect(onPick).toHaveBeenCalledWith('😀')
    expect(onClose).toHaveBeenCalled()
  })

  it('Recent drops custom emoji that no longer exist', async () => {
    noteRecentEmoji(':gone:')
    noteRecentEmoji(':moogle:')
    noteRecentEmoji('😀')
    setup()
    await ready()
    const recent = within(screen.getByRole('region', { name: 'Recent' })).getAllByRole('button')
    expect(recent.map((b) => b.getAttribute('aria-label'))).toEqual(['grinning face', ':moogle:'])
  })

  it('"Add emoji" shows first in Custom only when there is an add flow', async () => {
    const onAddEmoji = vi.fn()
    const { unmount } = setup({ onAddEmoji })
    await ready()
    const custom = within(screen.getByRole('region', { name: 'Custom' })).getAllByRole('button')
    expect(custom[0]).toHaveAccessibleName('Add emoji')
    fireEvent.click(custom[0])
    expect(onAddEmoji).toHaveBeenCalled()
    unmount()
    setup()
    await ready()
    expect(screen.queryByRole('button', { name: 'Add emoji' })).toBeNull()
  })

  it('desktop: hovering a custom emoji shows its card; deleting asks first, then removes it', async () => {
    setup()
    await ready()
    fireEvent.pointerEnter(screen.getByRole('button', { name: ':wipe_cry:' }), { pointerType: 'mouse' })
    expect(screen.getByText(':wipe_cry:')).toBeInTheDocument()
    expect(screen.getByText(/^Added by Alice · /)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Delete :wipe_cry:' }))
    expect(remove).not.toHaveBeenCalled()
    const confirm = screen.getByRole('alertdialog')
    expect(confirm).toHaveTextContent('Delete :wipe_cry: for both of you?')
    expect(confirm).toHaveTextContent('Messages that use it will show :wipe_cry: as text.')
    fireEvent.click(within(confirm).getByRole('button', { name: 'Keep' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(remove).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Delete :wipe_cry:' }))
    await act(async () => {
      fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }))
    })
    expect(remove).toHaveBeenCalledWith('id-wipe_cry')
  })

  it('the card reads "Added <date>" when the adder is unknown', async () => {
    setup()
    await ready()
    fireEvent.pointerEnter(screen.getByRole('button', { name: ':moogle:' }), { pointerType: 'mouse' })
    const line = screen.getByText(/^Added /)
    expect(line.textContent).not.toMatch(/by/)
    expect(line.textContent).toMatch(/12/)
  })

  it('a row deleted by the other person closes its open card and confirmation', async () => {
    setup()
    await ready()
    fireEvent.pointerEnter(screen.getByRole('button', { name: ':wipe_cry:' }), { pointerType: 'mouse' })
    fireEvent.click(screen.getByRole('button', { name: 'Delete :wipe_cry:' }))
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    act(() => setRows([row('moogle')]))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete :wipe_cry:' })).toBeNull()
  })

  it('phones: a long-press on a custom emoji opens its menu with Delete, which asks first', async () => {
    vi.useFakeTimers()
    const { onPick } = setup({ isDesktop: false })
    await act(async () => {})
    const cell = screen.getByRole('button', { name: ':moogle:' })
    fireEvent.pointerDown(cell, { pointerType: 'touch', clientX: 5, clientY: 5 })
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS))
    fireEvent.pointerUp(cell, { pointerType: 'touch' })
    fireEvent.click(cell)
    expect(onPick).not.toHaveBeenCalled()
    const menu = screen.getByRole('menu', { name: ':moogle:' })
    expect(menu).toHaveTextContent(/Added (?!by)/)
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Delete' }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Delete :moogle: for both of you?')
    // The search box isn't focused on phones (the keyboard would cover the panel).
    expect(screen.getByRole('searchbox', { name: 'Search emoji' })).not.toHaveFocus()
  })

  it('Escape closes only the picker: preventDefault, but the event still reaches window', async () => {
    const { onClose } = setup()
    await ready()
    const seen = vi.fn()
    const sheetLike = vi.fn((e: KeyboardEvent) => {
      if (!e.defaultPrevented) seen('sheet')
    })
    document.addEventListener('keydown', sheetLike)
    window.addEventListener('keydown', seen)
    fireEvent.keyDown(document.body, { key: 'Escape' })
    document.removeEventListener('keydown', sheetLike)
    window.removeEventListener('keydown', seen)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(seen).toHaveBeenCalledTimes(1)
    expect(seen).not.toHaveBeenCalledWith('sheet')
  })

  it('Escape with the delete confirmation open closes just the confirmation', async () => {
    const { onClose } = setup()
    await ready()
    fireEvent.pointerEnter(screen.getByRole('button', { name: ':wipe_cry:' }), { pointerType: 'mouse' })
    fireEvent.click(screen.getByRole('button', { name: 'Delete :wipe_cry:' }))
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('a press outside closes it; presses on the trigger or inside do not', async () => {
    const anchor = document.createElement('button')
    document.body.appendChild(anchor)
    const { onClose } = setup({ anchorRef: { current: anchor } })
    await ready()
    fireEvent.pointerDown(anchor)
    fireEvent.pointerDown(screen.getByRole('button', { name: 'red heart' }))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.pointerDown(document.body)
    expect(onClose).toHaveBeenCalledTimes(1)
    anchor.remove()
  })

  it('desktop: sits above its trigger, or flips below when there is no room', async () => {
    const anchor = document.createElement('button')
    document.body.appendChild(anchor)
    anchor.getBoundingClientRect = () => ({ top: 600, bottom: 640, left: 100, right: 140, width: 40, height: 40 }) as DOMRect
    const { unmount } = setup({ anchorRef: { current: anchor } })
    await ready()
    expect(screen.getByRole('dialog', { name: 'Emoji picker' })).toHaveStyle({ top: `${600 - 340 - 8}px`, left: '100px' })
    unmount()
    anchor.getBoundingClientRect = () => ({ top: 100, bottom: 140, left: 100, right: 140, width: 40, height: 40 }) as DOMRect
    setup({ anchorRef: { current: anchor } })
    await ready()
    expect(screen.getByRole('dialog', { name: 'Emoji picker' })).toHaveStyle({ top: '148px' })
    anchor.remove()
  })
})
