import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Ellipsis, Reply, SmilePlus } from 'lucide-react'
import { Icon } from '@/components/ui/Icon'
import { Portal } from '@/components/ui/Portal'
import type { EmojiLookup } from '@/components/chat2/Markdown'
import { QuickReactBar } from '@/components/chat2/QuickReactBar'
import { useLongPress } from '@/hooks/useLongPress'
import { noteRecentEmoji } from '@/lib/recentEmoji'
import { prefetchMedia, saveMedia } from '@/lib/saveMedia'
import { useAuthStore } from '@/stores/authStore'
import { useComposerStore } from '@/stores/composerStore'
import { useMessageStore } from '@/stores/messageStore'
import { chipsOf, useReactionStore } from '@/stores/reactionStore'
import type { Message } from '@/types'
import { buildActions, saveTargets, type ActionItem } from '@/components/chat2/messageActionItems'
import { isDisguised } from '@/stores/uiStore'

// ── Phone: the action sheet ──

interface ActionSheetProps {
  actions: ActionItem[]
  onClose: () => void
  /** The sheet's height once laid out, so the lifted bubble can move clear of it. */
  onHeight?: (px: number) => void
}

/** The long-press sheet: slides up from the bottom over a dimmed backdrop. Delete asks first. */
export function ActionSheet({ actions, onClose, onHeight }: ActionSheetProps) {
  const [confirming, setConfirming] = useState<ActionItem | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // An effect, not a layout effect: Portal attaches its node in its own effect (which runs first), and
  // before that the panel has no layout.
  useEffect(() => {
    if (panelRef.current) onHeight?.(panelRef.current.offsetHeight)
    // Measured once, when it opens: the confirm step is shorter, and the bubble needn't move back down.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // Dialogs open before this sheet are under it; one that opens later (Add emoji from the picker) is over it.
    const before = new Set(document.querySelectorAll('[role="dialog"]'))
    const newerDialogOpen = () =>
      Array.from(document.querySelectorAll('[role="dialog"]')).some(
        (d) => !before.has(d) && !panelRef.current?.contains(d) && !d.contains(panelRef.current),
      )
    const onKey = (e: globalThis.KeyboardEvent) => {
      // Not when something over the sheet (the emoji picker) already handled this Escape.
      if (e.key !== 'Escape' || e.defaultPrevented || isDisguised() || newerDialogOpen()) return
      onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    panelRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
  }, [confirming])

  const choose = (item: ActionItem) => {
    if (item.confirm && confirming !== item) {
      setConfirming(item)
      return
    }
    onClose()
    item.run()
  }

  const row = 'flex w-full items-center gap-3.5 rounded-lg px-3.5 py-3 text-left text-[15px] outline-none transition-colors active:bg-[color:var(--seg)] focus-visible:bg-[color:var(--seg)]'

  return (
    <Portal>
      <div data-testid="sheet-backdrop" aria-hidden="true" onClick={onClose} className="sheet-dim fixed inset-0 z-40 bg-black/45" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Message actions"
        className="sheet-up fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t border-[color:var(--line)] bg-[color:var(--bar)] px-2 pb-[max(10px,env(safe-area-inset-bottom))] pt-2 text-[color:var(--fg)] shadow-[0_-10px_30px_var(--shadow)]"
      >
        <div aria-hidden="true" className="mx-auto mb-1.5 h-1 w-9 rounded-full bg-[color:var(--line)]" />
        {confirming ? (
          <div className="flex flex-col">
            <p className="px-3.5 py-2 text-sm text-[color:var(--muted)]">{confirming.confirm!.title}</p>
            <button type="button" onClick={() => choose(confirming)} className={`${row} font-semibold text-[color:var(--danger)]`}>
              <Icon icon={confirming.icon} size={20} />
              {confirming.confirm!.action}
            </button>
            <button type="button" onClick={() => setConfirming(null)} className={row}>
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex flex-col">
            {actions.map((item) => (
              <div key={item.id} className="contents">
                {item.danger && <div role="separator" className="mx-2 my-1 h-px bg-[color:var(--line)]" />}
                <button
                  type="button"
                  onClick={() => choose(item)}
                  className={`${row} ${item.danger ? 'text-[color:var(--danger)]' : ''}`}
                >
                  <Icon icon={item.icon} size={20} className={item.danger ? '' : 'text-[color:var(--muted)]'} />
                  {item.label}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Portal>
  )
}

// ── Desktop: the hover toolbar ──

interface HoverToolbarProps {
  side: 'me' | 'them'
  onReact: () => void
  onReply: () => void
  /** The ⋯ menu's items. */
  actions: ActionItem[]
  /** Above the toolbar (the quick-react bar while open). */
  children?: ReactNode
}

/** React · Reply · ⋯ at the bubble's top corner; ⋯ opens a menu styled like the header's. */
export function HoverToolbar({ side, onReact, onReply, actions, children }: HoverToolbarProps) {
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState<ActionItem | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const moreRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const close = useCallback(() => {
    setOpen(false)
    setConfirming(null)
  }, [])

  useEffect(() => {
    if (!open) return
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close()
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open, confirming, close])

  const choose = (item: ActionItem) => {
    if (item.confirm && confirming !== item) {
      setConfirming(item)
      return
    }
    close()
    item.run()
  }

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])]
    const i = items.findIndex((el) => el === document.activeElement)
    const focus = (n: number) => items[((n % items.length) + items.length) % items.length]?.focus()
    if (e.key === 'ArrowDown') focus(i + 1)
    else if (e.key === 'ArrowUp') focus(i < 0 ? -1 : i - 1)
    else if (e.key === 'Home') focus(0)
    else if (e.key === 'End') focus(items.length - 1)
    else if (e.key === 'Escape') {
      close()
      // Not swallowed: Esc Esc still shows the disguise while the menu is open.
      moreRef.current?.focus()
    } else if (e.key === 'Tab') {
      close()
      return
    } else return
    e.preventDefault()
  }

  const button = 'flex h-7 w-7 items-center justify-center rounded-md text-[color:var(--muted)] transition-colors hover:bg-[color:var(--seg)] hover:text-[color:var(--fg)]'
  const item = 'flex items-center gap-2.5 rounded-md px-2 py-[7px] text-left outline-none transition-colors hover:bg-[color:var(--seg)] focus:bg-[color:var(--seg)]'

  return (
    <div ref={rootRef} className={`absolute -top-4 z-20 ${side === 'me' ? 'right-1' : 'left-1'}`}>
      {children}
      <div
        role="toolbar"
        aria-label="Message actions"
        className="flex items-center gap-px rounded-lg border border-[color:var(--line)] bg-[color:var(--bar)] p-0.5 shadow-[0_2px_8px_var(--shadow)]"
      >
        <button type="button" aria-label="React" title="React" onClick={onReact} className={button}>
          <Icon icon={SmilePlus} size={16} />
        </button>
        <button type="button" aria-label="Reply" title="Reply (R)" onClick={onReply} className={button}>
          <Icon icon={Reply} size={16} />
        </button>
        <button
          ref={moreRef}
          type="button"
          aria-label="More actions"
          title="More actions"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => (open ? close() : setOpen(true))}
          className={button}
        >
          <Icon icon={Ellipsis} size={16} />
        </button>
      </div>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="More actions"
          onKeyDown={onMenuKey}
          className={`absolute top-[calc(100%+4px)] z-50 flex min-w-[210px] flex-col rounded-[10px] border border-[color:var(--line)] bg-[color:var(--bar)] p-1.5 text-[13px] text-[color:var(--fg)] shadow-[0_10px_30px_var(--shadow),0_2px_6px_var(--shadow)] ${
            side === 'me' ? 'right-0' : 'left-0'
          }`}
        >
          {confirming ? (
            <>
              <p className="px-2 py-1.5 text-[color:var(--muted)]">{confirming.confirm!.title}</p>
              <button type="button" role="menuitem" tabIndex={-1} onClick={() => choose(confirming)} className={`${item} font-semibold text-[color:var(--danger)]`}>
                <Icon icon={confirming.icon} size={16} />
                {confirming.confirm!.action}
              </button>
              <button type="button" role="menuitem" tabIndex={-1} onClick={() => setConfirming(null)} className={item}>
                Cancel
              </button>
            </>
          ) : (
            actions.map((a) => (
              <div key={a.id} className="contents">
                {a.danger && <div role="separator" className="mx-0.5 my-1 h-px bg-[color:var(--line)]" />}
                <button
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  onClick={() => choose(a)}
                  className={`${item} ${a.danger ? 'text-[color:var(--danger)]' : ''}`}
                >
                  <Icon icon={a.icon} size={16} className={a.danger ? '' : 'text-[color:var(--muted)]'} />
                  {a.label}
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ── The row wrapper ──

interface MessageActionsProps {
  message: Message
  mine: boolean
  pinned: boolean
  /** spaceKey(conversationId, space) of the list. */
  spaceKey: string
  isDesktop: boolean
  emoji: EmojiLookup
  onSetReply?: (message: Message) => void
  onPin: (id: string) => void
  onUnpin: (id: string) => void
  onBroadcastDelete: (id: string) => void
  /** A short notice over the list (a failure). */
  onNotice: (text: string) => void
  /** The bubble. */
  children: ReactNode
}

/**
 * Only events from inside the row's own DOM: React bubbles the action sheet's events (it's in a portal)
 * through this row too, and a press on the sheet mustn't start another long-press or lose its click.
 */
const inDom =
  <E extends React.SyntheticEvent>(handler: (e: E) => void) =>
  (e: E): void => {
    if ((e.currentTarget as Node).contains(e.target as Node)) handler(e)
  }

type Box = { top: number; left: number; width: number; height: number }

const mediaIndexOf = (el: Element | null): number | null => {
  const raw = el?.closest('[data-media-index]')?.getAttribute('data-media-index')
  return raw == null ? null : Number(raw)
}

/**
 * Wraps a bubble with its actions. Phones: long-press lifts the bubble, with the quick-react bar above it
 * and the action sheet below. Desktop: the hover toolbar. Either way the row is focusable: R replies,
 * E edits my message, and "More actions" opens the sheet (phones) or menu (desktop) from the keyboard.
 */
export function MessageActions({
  message,
  mine,
  pinned,
  spaceKey,
  isDesktop,
  emoji,
  onSetReply,
  onPin,
  onUnpin,
  onBroadcastDelete,
  onNotice,
  children,
}: MessageActionsProps) {
  /** The open sheet; `lifted` is where the long-pressed bubble was on screen (keyboard: none). */
  const [sheet, setSheet] = useState<{ mediaIndex: number | null; lifted: Box | null } | null>(null)
  const [hover, setHover] = useState(false)
  const [focusWithin, setFocusWithin] = useState(false)
  const [reacting, setReacting] = useState(false)
  const [menuMedia, setMenuMedia] = useState<number | null>(null)
  const rowRef = useRef<HTMLDivElement>(null)
  const bubbleRef = useRef<HTMLDivElement>(null)
  /** How far the lifted bubble moves up to sit above the sheet (and its quick bar below the header). */
  const [shift, setShift] = useState(0)
  const editing = useComposerStore((s) => s.editing?.id === message.id)

  const closeSheet = useCallback(() => {
    setSheet(null)
    setShift(0)
  }, [])

  const clearSheet = (sheetHeight: number) => {
    if (!sheet?.lifted) return
    const { top, height } = sheet.lifted
    const bottom = top + height
    const viewport = window.visualViewport?.height ?? window.innerHeight
    const gap = 12
    // Room for the quick bar above the bubble, under the header.
    const minTop = 120
    const needed = bottom - (viewport - sheetHeight - gap)
    setShift(Math.max(0, Math.min(needed, top - minTop)))
  }
  const closeReacting = useCallback(() => setReacting(false), [])

  const react = (e: string) => {
    const myId = useAuthStore.getState().user?.id
    if (!myId) return
    const store = useReactionStore.getState()
    const adding = !chipsOf(store.byMessage[message.id], myId).some((c) => c.emoji === e && c.mine)
    if (adding) noteRecentEmoji(e)
    void store.toggle(message.id, e, myId)
  }

  const reply = () => onSetReply?.(message)
  const edit = () => useComposerStore.getState().startEdit(message)

  const actionsFor = (mediaIndex: number | null) =>
    buildActions({
      message,
      mine,
      pinned,
      mediaIndex,
      on: {
        reply,
        copy: () => {
          if (message.content) navigator.clipboard?.writeText(message.content).catch(() => {})
        },
        edit,
        pin: () => onPin(message.id),
        unpin: () => onUnpin(message.id),
        spoiler: (index, value) => {
          void useMessageStore
            .getState()
            .setAttachmentSpoiler(spaceKey, message.id, index, value)
            .then((ok) => {
              if (!ok) onNotice("Couldn't change the spoiler")
            })
        },
        save: (index) => {
          const a = message.attachments[index]
          if (!a) return
          void saveMedia(a).then((r) => {
            // Safari wanted a fresher tap than the fetch left: the file is ready for the next one.
            if (r === 'again') onNotice('Ready: tap Save again')
            else if (r === 'failed') onNotice("Couldn't save")
          })
        },
        remove: () => {
          void useMessageStore
            .getState()
            .deleteMessage(message.id, spaceKey)
            .then(() => onBroadcastDelete(message.id))
        },
      },
    })

  // The sheet's Save items share from the cache, inside the tap (see saveMedia): fetch as it opens.
  const sheetMedia = sheet ? sheet.mediaIndex ?? -1 : null
  useEffect(() => {
    if (sheetMedia === null) return
    for (const { a } of saveTargets(message, sheetMedia === -1 ? null : sheetMedia)) prefetchMedia(a)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetMedia])

  const longPress = useLongPress(
    (target) => {
      const r = bubbleRef.current?.getBoundingClientRect()
      setSheet({ mediaIndex: mediaIndexOf(target), lifted: r ? { top: r.top, left: r.left, width: r.width, height: r.height } : null })
    },
    { enabled: !isDesktop },
  )

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || e.metaKey || e.ctrlKey || e.altKey) return
    const k = e.key.toLowerCase()
    if (k === 'r') {
      e.preventDefault()
      reply()
    } else if (k === 'e' && mine && message.content) {
      e.preventDefault()
      edit()
    }
  }

  const lifted = sheet?.lifted ?? null
  const showToolbar = isDesktop && !editing && (hover || focusWithin || reacting)

  return (
    <div
      ref={rowRef}
      role="group"
      aria-label="Message"
      aria-keyshortcuts={isDesktop ? (mine ? 'R E' : 'R') : undefined}
      // Desktop only: on phones a tap would focus the row and close the keyboard. There, the row's
      // "More actions" button is the keyboard and screen-reader way in.
      tabIndex={isDesktop ? 0 : undefined}
      onKeyDown={onKeyDown}
      onPointerEnter={isDesktop ? () => setHover(true) : undefined}
      onPointerLeave={(e) => {
        if (isDesktop) {
          setHover(false)
          setMenuMedia(null)
        } else longPress.onPointerLeave(e)
      }}
      onPointerOver={
        isDesktop
          ? (e) => {
              const t = e.target as Element
              if (t.closest('[role="toolbar"],[role="menu"]')) return
              setMenuMedia(mediaIndexOf(t))
            }
          : undefined
      }
      onFocus={() => setFocusWithin(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusWithin(false)
      }}
      onPointerDown={inDom(longPress.onPointerDown)}
      onPointerMove={inDom(longPress.onPointerMove)}
      onPointerUp={inDom(longPress.onPointerUp)}
      onPointerCancel={inDom(longPress.onPointerCancel)}
      onClickCapture={inDom(longPress.onClickCapture)}
      onContextMenu={inDom(longPress.onContextMenu)}
      className={`relative flex w-full flex-col rounded-[10px] outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] ${
        mine ? 'items-end' : 'items-start'
      } ${isDesktop ? '' : 'touch-pan-y select-none [-webkit-touch-callout:none]'}`}
    >
      {/* While lifted, the bubble shows in the overlay above the dim instead (see below). */}
      <div ref={bubbleRef} className={`flex w-full flex-col ${mine ? 'items-end' : 'items-start'} ${lifted ? 'invisible' : ''}`}>
        {children}
      </div>

      {showToolbar && (
        <HoverToolbar side={mine ? 'me' : 'them'} onReact={() => setReacting((v) => !v)} onReply={reply} actions={actionsFor(menuMedia)}>
          {reacting && (
            <QuickReactBar
              emoji={emoji}
              isDesktop
              onPick={react}
              onClose={closeReacting}
              className={`!absolute bottom-full mb-1 ${mine ? 'right-0' : 'left-0'}`}
            />
          )}
        </HoverToolbar>
      )}

      {!isDesktop && (
        <button
          type="button"
          onClick={() => setSheet({ mediaIndex: null, lifted: null })}
          className="sr-only focus:not-sr-only focus:mt-1 focus:rounded-md focus:bg-[color:var(--bar)] focus:px-2 focus:py-1 focus:text-xs focus:text-[color:var(--fg)]"
        >
          More actions
        </button>
      )}

      {sheet && (
        <ActionSheet
          actions={actionsFor(sheet.mediaIndex)}
          onHeight={sheet.lifted ? clearSheet : undefined}
          onClose={() => {
            closeSheet()
            rowRef.current?.focus({ preventScroll: true })
          }}
        />
      )}

      {lifted && (
        // The lifted bubble: drawn again above the dim (any stacking context around the list would
        // trap the original under it), moved clear of the sheet, with the quick-react bar above it.
        <Portal>
          <div
            data-lifted
            className={`fixed z-50 flex flex-col transition-transform duration-200 ${mine ? 'items-end' : 'items-start'}`}
            style={{ top: lifted.top, left: lifted.left, width: lifted.width, transform: `translateY(${-shift}px)` }}
          >
            <QuickReactBar
              emoji={emoji}
              isDesktop={false}
              onPick={react}
              onClose={closeSheet}
              ignoreOutside
              className={`!absolute bottom-full mb-2 ${mine ? 'right-0' : 'left-0'}`}
            />
            <div
              aria-hidden="true"
              className={`lift pointer-events-none flex w-full flex-col ${mine ? 'origin-right items-end' : 'origin-left items-start'}`}
            >
              {children}
            </div>
          </div>
        </Portal>
      )}
    </div>
  )
}
