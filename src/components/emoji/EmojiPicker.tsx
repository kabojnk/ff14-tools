import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import {
  Car,
  Clock,
  Coffee,
  Flag,
  Heart,
  Leaf,
  Lightbulb,
  Plus,
  Search,
  Smile,
  Star,
  Trash2,
  Volleyball,
  type LucideIcon,
} from 'lucide-react'
import { Icon } from '@/components/ui/Icon'
import { Portal } from '@/components/ui/Portal'
import { DESKTOP_QUERY, useMediaQuery } from '@/hooks/useMediaQuery'
import { useLongPress } from '@/hooks/useLongPress'
import { loadEmoji, searchEmoji, type EmojiTabId, type StandardEmoji } from '@/lib/emoji/data'
import { noteRecentEmoji, recentEmojiList } from '@/lib/recentEmoji'
import { useEmojiStore } from '@/stores/emojiStore'
import { useProfileStore } from '@/stores/profileStore'
import type { CustomEmoji } from '@/types'

export type EmojiPickerMode = 'composer' | 'reaction'

export interface EmojiPickerProps {
  /** 'composer' stays open after a pick (to pick several); 'reaction' closes. Both record the pick as recent. */
  mode: EmojiPickerMode
  /** A standard emoji, or a custom one as `:name:`. */
  onPick: (emoji: string) => void
  onClose: () => void
  /** Shows the "Add emoji" tile first in Custom. */
  onAddEmoji?: () => void
  /** The button that opened it. The desktop popover sits above it (below when there's no room), and a press on it isn't "outside". */
  anchorRef?: RefObject<HTMLElement | null>
  /** Another area whose presses aren't "outside" (the composer). */
  insideRef?: RefObject<HTMLElement | null>
  /**
   * Phones: 'inline' renders in the layout flow (the composer puts it under itself, so it pushes the
   * composer up like the keyboard does); 'overlay' (default) is a bottom panel over a dim backdrop.
   */
  phone?: 'inline' | 'overlay'
  /** The layout, when the caller knows it; otherwise DESKTOP_QUERY decides. */
  isDesktop?: boolean
}

const TABS: { id: EmojiTabId; label: string; icon: LucideIcon }[] = [
  { id: 'recent', label: 'Recent', icon: Clock },
  { id: 'custom', label: 'Custom', icon: Star },
  { id: 'smileys', label: 'Smileys & people', icon: Smile },
  { id: 'nature', label: 'Nature', icon: Leaf },
  { id: 'food', label: 'Food & drink', icon: Coffee },
  { id: 'activities', label: 'Activities', icon: Volleyball },
  { id: 'travel', label: 'Travel & places', icon: Car },
  { id: 'objects', label: 'Objects', icon: Lightbulb },
  { id: 'symbols', label: 'Symbols', icon: Heart },
  { id: 'flags', label: 'Flags', icon: Flag },
]

const CUSTOM = /^:([\w-]+):$/
const POPOVER_W = 352
const POPOVER_H = 340
const GAP = 8
const MARGIN = 8

/** The PinPad sits above everything and owns the keyboard while it's open. */
const pinPadOpen = () => document.querySelector('[data-pin-pad]') !== null

type Status = 'loading' | 'ready' | 'error'

/** "Added by Bea · 12 Sep", or "Added 12 Sep" when the adder isn't known. */
function addedLine(row: Pick<CustomEmoji, 'created_at'>, nickname: string | null): string {
  const d = new Date(row.created_at)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  const date = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: sameYear ? undefined : 'numeric' })
  return nickname ? `Added by ${nickname} · ${date}` : `Added ${date}`
}

/**
 * The emoji picker (design §11): search, then Recent, Custom and the standard categories as one
 * scrolling list with a tab row. Desktop: a 352×340 popover anchored to its trigger. Phones: a panel
 * at 54% height, either in the layout under the composer or over a dim backdrop.
 *
 * Escape closes only the picker: it listens in the capture phase and calls `preventDefault()` (so a
 * Sheet underneath ignores the event) but never stops propagation (the double-Esc disguise shortcut
 * still sees it). A sheet opened over the picker later (Add emoji) keeps its own Escape and presses.
 */
export function EmojiPicker({
  mode,
  onPick,
  onClose,
  onAddEmoji,
  anchorRef,
  insideRef,
  phone = 'overlay',
  isDesktop: isDesktopProp,
}: EmojiPickerProps) {
  const matchesDesktop = useMediaQuery(DESKTOP_QUERY)
  const desktop = isDesktopProp ?? matchesDesktop
  const rootRef = useRef<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const sectionRefs = useRef<Partial<Record<EmojiTabId, HTMLElement | null>>>({})

  const rows = useEmojiStore((s) => s.rows)
  const byName = useEmojiStore((s) => s.byName)
  const profiles = useProfileStore((s) => s.profiles)

  const [query, setQuery] = useState('')
  const [data, setData] = useState<StandardEmoji[] | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [active, setActive] = useState<EmojiTabId>('recent')
  /** Desktop: the custom emoji whose card shows in the footer (hovered or focused last). */
  const [cardId, setCardId] = useState<string | null>(null)
  /** Phones: the long-press menu of a custom emoji. */
  const [menu, setMenu] = useState<{ id: string; top: number; left: number } | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [recentRaw] = useState(recentEmojiList)

  // A row deleted (here or by the other person) takes its card, menu and confirmation with it.
  const card = cardId ? (rows.find((r) => r.id === cardId) ?? null) : null
  const menuRow = menu ? (rows.find((r) => r.id === menu.id) ?? null) : null
  const confirming = confirmId ? (rows.find((r) => r.id === confirmId) ?? null) : null

  const load = useCallback(() => {
    setStatus('loading')
    loadEmoji().then(
      (all) => {
        setData(all)
        setStatus('ready')
      },
      () => setStatus('error'),
    )
  }, [])

  useEffect(() => {
    load()
    void useEmojiStore.getState().load()
  }, [load])

  useEffect(() => {
    // Desktop only: on a phone the keyboard would jump up over the panel.
    if (desktop) searchRef.current?.focus({ preventScroll: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pick = (emoji: string) => {
    onPick(emoji)
    noteRecentEmoji(emoji)
    if (mode === 'reaction') onClose()
  }

  // ── Escape and presses outside ──
  const escapeRef = useRef<() => void>(() => {})
  escapeRef.current = () => {
    if (confirmId || menu) {
      setConfirmId(null)
      setMenu(null)
    } else onClose()
  }
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    // Dialogs already open (a sheet the picker was opened from) are under it; one that opens later is over it.
    const before = new Set(document.querySelectorAll('[role="dialog"]'))
    const inNewerDialog = (target: EventTarget | null) => {
      const dialog = target instanceof Element ? target.closest('[role="dialog"]') : null
      return dialog !== null && !rootRef.current?.contains(dialog) && !before.has(dialog)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || pinPadOpen() || inNewerDialog(e.target)) return
      // Never stopPropagation: the double-Esc disguise shortcut on window must still see it.
      e.preventDefault()
      escapeRef.current()
    }
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (rootRef.current?.contains(t) || anchorRef?.current?.contains(t) || insideRef?.current?.contains(t)) return
      if (inNewerDialog(t) || pinPadOpen()) return
      closeRef.current()
    }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('pointerdown', onDown, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('pointerdown', onDown, true)
    }
  }, [anchorRef, insideRef])

  // ── Desktop: anchored to the trigger ──
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  useLayoutEffect(() => {
    if (!desktop) return
    const place = () => {
      const vw = window.innerWidth
      const vh = window.innerHeight
      const r = anchorRef?.current?.getBoundingClientRect()
      if (!r) {
        setPos({ top: Math.max(MARGIN, (vh - POPOVER_H) / 2), left: Math.max(MARGIN, (vw - POPOVER_W) / 2) })
        return
      }
      let top = r.top - POPOVER_H - GAP
      if (top < MARGIN) top = r.bottom + GAP // no room above: flip below
      top = Math.max(MARGIN, Math.min(top, vh - POPOVER_H - MARGIN))
      // Lines up with the trigger's left edge, or its right edge when the trigger is on the right.
      let left = r.left + r.width / 2 > vw / 2 ? r.right - POPOVER_W : r.left
      left = Math.max(MARGIN, Math.min(left, vw - POPOVER_W - MARGIN))
      setPos({ top, left })
    }
    place()
    const onScroll = (e: Event) => {
      if (!(e.target instanceof Node && rootRef.current?.contains(e.target))) place()
    }
    window.addEventListener('resize', place)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [desktop, anchorRef])

  // ── Sections ──
  const recent = useMemo(
    () =>
      recentRaw.filter((e) => {
        const name = CUSTOM.exec(e)?.[1]
        // A deleted custom emoji drops out of Recent.
        return !name || byName[name] !== undefined
      }),
    [recentRaw, byName],
  )
  const labels = useMemo(() => new Map((data ?? []).map((e) => [e.emoji, e.label])), [data])
  const byTab = useMemo(() => {
    const out: Partial<Record<EmojiTabId, StandardEmoji[]>> = {}
    for (const e of data ?? []) (out[e.tab] ??= []).push(e)
    return out
  }, [data])
  const rowByName = useMemo(() => new Map(rows.map((r) => [r.name, r])), [rows])

  const q = query.trim()
  const results = useMemo(() => (q ? searchEmoji(data ?? [], rows, q) : null), [q, data, rows])

  const scrollToTab = (id: EmojiTabId) => {
    setActive(id)
    const body = bodyRef.current
    const section = sectionRefs.current[id]
    if (!body || !section) return
    // Not scrollIntoView: that also scrolls overflow-hidden ancestors (the app shell) on iOS.
    const top = body.scrollTop + section.getBoundingClientRect().top - body.getBoundingClientRect().top
    body.scrollTo?.({ top })
  }

  const onBodyScroll = () => {
    const body = bodyRef.current
    if (!body || results) return
    const bodyTop = body.getBoundingClientRect().top
    let current: EmojiTabId = 'recent'
    for (const tab of TABS) {
      const section = sectionRefs.current[tab.id]
      if (section && section.getBoundingClientRect().top - bodyTop <= 12) current = tab.id
    }
    setActive(current)
  }

  const nicknameOf = (row: CustomEmoji) => (row.uploaded_by ? (profiles[row.uploaded_by]?.nickname ?? null) : null)

  const askDelete = (row: CustomEmoji) => {
    setMenu(null)
    setDeleteError(null)
    setConfirmId(row.id)
  }

  const confirmDelete = async (row: CustomEmoji) => {
    setConfirmId(null)
    setCardId(null)
    const { error } = await useEmojiStore.getState().remove(row.id)
    if (error) setDeleteError(error)
  }

  const openMenu = (row: CustomEmoji, target: Element) => {
    const panel = panelRef.current
    if (!panel) return
    const p = panel.getBoundingClientRect()
    const r = target.getBoundingClientRect()
    const menuH = 110
    const menuW = 180
    let top = r.bottom - p.top + 4
    if (top + menuH > p.height) top = Math.max(4, r.top - p.top - menuH - 4)
    const left = Math.max(4, Math.min(r.left - p.left, p.width - menuW - 4))
    setMenu({ id: row.id, top, left })
  }

  const cols = desktop ? 'grid-cols-9' : 'grid-cols-8'

  const standardCell = (emoji: string, label: string) => (
    <button
      key={emoji}
      type="button"
      aria-label={label}
      title={desktop ? label : undefined}
      onClick={() => pick(emoji)}
      onPointerEnter={desktop ? () => setCardId(null) : undefined}
      className="grid aspect-square place-items-center rounded-[7px] text-[21px] leading-none outline-none transition-colors hover:bg-[color:var(--seg)] focus-visible:bg-[color:var(--seg)]"
    >
      {emoji}
    </button>
  )

  const customCell = (row: CustomEmoji) => (
    <CustomCell
      key={row.id}
      row={row}
      desktop={desktop}
      onPick={pick}
      onShowCard={setCardId}
      onLongPress={openMenu}
    />
  )

  /** A Recent entry: a standard emoji (named by its label once the dataset is in) or a known custom one. */
  const recentCell = (e: string) => {
    const name = CUSTOM.exec(e)?.[1]
    const row = name ? rowByName.get(name) : undefined
    if (row) return customCell(row)
    return standardCell(e, labels.get(e) ?? e)
  }

  const sectionTitle = (text: string) => (
    <h3 className="px-1 pb-[3px] pt-1.5 text-[10px] font-bold uppercase tracking-[0.07em] text-[color:var(--muted)]">{text}</h3>
  )

  const skeleton = (
    <div role="status" aria-label="Loading emoji" className={`grid ${cols} gap-px`}>
      {Array.from({ length: desktop ? 27 : 24 }, (_, i) => (
        <span key={i} className="m-1 aspect-square animate-pulse rounded-[7px] bg-[color:var(--seg)]" />
      ))}
    </div>
  )

  let body: ReactNode
  if (results) {
    const customHits = results.custom.map((n) => rowByName.get(n)).filter((r): r is CustomEmoji => r !== undefined)
    body =
      customHits.length + results.standard.length === 0 ? (
        status === 'loading' ? (
          skeleton
        ) : (
          <p className="px-2 py-6 text-center text-[13px] text-[color:var(--muted)]">No emoji match “{q}”</p>
        )
      ) : (
        <div role="group" aria-label="Search results" className={`grid ${cols} gap-px`}>
          {customHits.map(customCell)}
          {results.standard.map((e) => standardCell(e.emoji, e.label))}
        </div>
      )
  } else {
    body = TABS.map((tab) => {
      let content: ReactNode
      if (tab.id === 'recent') {
        content =
          recent.length > 0 ? (
            <div className={`grid ${cols} gap-px`}>{recent.map(recentCell)}</div>
          ) : (
            <p className="px-1 pb-1 text-[12px] text-[color:var(--muted)]">Emoji you use show up here.</p>
          )
      } else if (tab.id === 'custom') {
        content =
          rows.length > 0 || onAddEmoji ? (
            <div className={`grid ${cols} gap-px`}>
              {onAddEmoji && (
                <button
                  type="button"
                  aria-label="Add emoji"
                  title={desktop ? 'Add emoji' : undefined}
                  onClick={onAddEmoji}
                  className="m-0.5 grid aspect-square place-items-center rounded-[7px] border-[1.5px] border-dashed border-[color:var(--muted)] text-[color:var(--muted)] hover:text-[color:var(--fg)]"
                >
                  <Icon icon={Plus} size={18} />
                </button>
              )}
              {rows.map(customCell)}
            </div>
          ) : (
            <p className="px-1 pb-1 text-[12px] text-[color:var(--muted)]">No custom emoji yet.</p>
          )
      } else if (status === 'error') {
        content =
          tab.id === 'smileys' ? (
            <div className="flex flex-col items-center gap-2 py-6 text-[13px] text-[color:var(--muted)]">
              <p>Couldn’t load emoji</p>
              <button
                type="button"
                onClick={load}
                className="rounded-lg bg-[color:var(--seg)] px-3 py-1.5 font-semibold text-[color:var(--fg)]"
              >
                Retry
              </button>
            </div>
          ) : null
      } else if (status === 'loading') {
        content = tab.id === 'smileys' ? skeleton : null
      } else {
        content = <div className={`grid ${cols} gap-px`}>{(byTab[tab.id] ?? []).map((e) => standardCell(e.emoji, e.label))}</div>
      }
      const title = tab.id === 'custom' && rows.length > 0 ? `Custom · ${rows.length}` : tab.label
      return (
        <section
          key={tab.id}
          ref={(el) => {
            sectionRefs.current[tab.id] = el
          }}
          aria-label={tab.label}
          data-emoji-section={tab.id}
        >
          {sectionTitle(title)}
          {content}
        </section>
      )
    })
  }

  const content = (
    <>
      <label className="mx-2.5 mb-1.5 mt-2.5 flex h-[30px] flex-none items-center gap-[7px] rounded-lg border border-[color:var(--line)] bg-[color:var(--field)] px-[9px] text-[color:var(--muted)]">
        <Icon icon={Search} size={15} />
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search emoji"
          aria-label="Search emoji"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="search"
          className={`min-w-0 flex-1 bg-transparent text-[color:var(--fg)] outline-none placeholder:text-[color:var(--muted)] ${
            desktop ? 'text-[13px]' : 'text-[16px]'
          }`}
        />
      </label>
      <div role="tablist" aria-label="Emoji categories" className="flex flex-none gap-0.5 border-b border-[color:var(--line)] px-1.5">
        {TABS.map((tab) => {
          const on = !results && active === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={on}
              aria-label={tab.label}
              title={desktop ? tab.label : undefined}
              onClick={() => {
                if (results) {
                  // Leaving a search: scroll once the sections are back.
                  setQuery('')
                  requestAnimationFrame(() => scrollToTab(tab.id))
                } else scrollToTab(tab.id)
              }}
              className={`grid min-w-[22px] flex-1 place-items-center border-b-2 pb-[7px] pt-1.5 transition-colors ${
                on ? 'border-[color:var(--accent)] text-[color:var(--accent)]' : 'border-transparent text-[color:var(--muted)] hover:text-[color:var(--fg)]'
              }`}
            >
              <Icon icon={tab.icon} size={17} />
            </button>
          )
        })}
      </div>
      <div
        ref={bodyRef}
        onScroll={onBodyScroll}
        onPointerDownCapture={(e) => {
          if (menu && !(e.target as Element).closest('[role="menu"]')) setMenu(null)
        }}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2 pt-1">
        {body}
      </div>

      {deleteError && (
        <p role="alert" className="flex-none border-t border-[color:var(--line)] px-3 py-1.5 text-[12px] text-[color:var(--danger,#ef4444)]">
          {deleteError}
        </p>
      )}

      {desktop && card && !confirming && (
        <div data-emoji-card className="flex flex-none items-center gap-2.5 border-t border-[color:var(--line)] bg-[color:var(--seg)] px-3 py-2">
          <img src={card.image_url} alt="" className="h-[30px] w-[30px] flex-none rounded-lg object-contain" />
          <span className="flex min-w-0 flex-1 flex-col leading-tight">
            <b className="truncate text-[12.5px]">:{card.name}:</b>
            <small className="truncate text-[11px] text-[color:var(--muted)]">{addedLine(card, nicknameOf(card))}</small>
          </span>
          <button
            type="button"
            aria-label={`Delete :${card.name}:`}
            title={`Delete :${card.name}:`}
            onClick={() => askDelete(card)}
            className="grid h-7 w-7 flex-none place-items-center rounded-md text-[color:var(--danger,#ef4444)] hover:bg-[color:var(--seg-on)]"
          >
            <Icon icon={Trash2} size={16} />
          </button>
        </div>
      )}

      {menu && menuRow && !confirming && (
        <div
          role="menu"
          aria-label={`:${menuRow.name}:`}
          className="absolute z-10 min-w-[160px] rounded-[10px] border border-[color:var(--line)] bg-[color:var(--bar)] p-[5px] text-[12.5px] shadow-[0_10px_30px_var(--shadow)]"
          style={{ top: menu.top, left: menu.left }}
        >
          <div className="mb-1 flex items-center gap-2 border-b border-[color:var(--line)] px-[7px] pb-[7px] pt-[5px]">
            <img src={menuRow.image_url} alt="" className="h-[26px] w-[26px] rounded-md object-contain" />
            <span className="min-w-0">
              <b className="block truncate">:{menuRow.name}:</b>
              <small className="block truncate text-[10.5px] text-[color:var(--muted)]">{addedLine(menuRow, nicknameOf(menuRow))}</small>
            </span>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => askDelete(menuRow)}
            className="flex w-full items-center gap-2 rounded-md px-[7px] py-1.5 text-left text-[color:var(--danger,#ef4444)] active:bg-[color:var(--seg)]"
          >
            <Icon icon={Trash2} size={16} />
            Delete
          </button>
        </div>
      )}

      {confirming && (
        <div className="absolute inset-0 z-20 flex items-end bg-black/35">
          <div
            role="alertdialog"
            aria-label={`Delete :${confirming.name}:`}
            className="m-2 flex w-full flex-col gap-2 rounded-xl border border-[color:var(--line)] bg-[color:var(--bar)] p-3 shadow-[0_10px_30px_var(--shadow)]"
          >
            <div className="flex items-center gap-2.5">
              <img src={confirming.image_url} alt="" className="h-8 w-8 flex-none rounded-lg object-contain" />
              <p className="text-[13.5px] font-semibold">Delete :{confirming.name}: for both of you?</p>
            </div>
            <p className="text-[12px] text-[color:var(--muted)]">Messages that use it will show :{confirming.name}: as text.</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmId(null)}
                className="rounded-lg bg-[color:var(--seg)] px-3 py-1.5 text-[13px] font-semibold"
              >
                Keep
              </button>
              <button
                type="button"
                onClick={() => void confirmDelete(confirming)}
                className="rounded-lg bg-[color:var(--danger,#ef4444)] px-3 py-1.5 text-[13px] font-semibold text-white"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )

  const panelClass = 'relative flex flex-col overflow-hidden bg-[color:var(--bar)] text-[color:var(--fg)]'

  if (desktop) {
    return (
      <Portal>
        <div
          ref={(el) => {
            rootRef.current = el
            panelRef.current = el
          }}
          role="dialog"
          aria-label="Emoji picker"
          data-emoji-picker
          className={`${panelClass} fixed z-50 rounded-xl border border-[color:var(--line)] shadow-[0_16px_40px_var(--shadow),0_2px_6px_var(--shadow)]`}
          style={{
            top: pos?.top ?? 0,
            left: pos?.left ?? 0,
            width: POPOVER_W,
            height: POPOVER_H,
            maxWidth: `calc(100vw - ${2 * MARGIN}px)`,
            visibility: pos ? undefined : 'hidden',
          }}
        >
          {content}
        </div>
      </Portal>
    )
  }

  if (phone === 'inline') {
    return (
      <div
        ref={(el) => {
          rootRef.current = el
          panelRef.current = el
        }}
        role="dialog"
        aria-label="Emoji picker"
        data-emoji-picker
        className={`${panelClass} h-[54%] flex-none border-t border-[color:var(--line)] pb-[env(safe-area-inset-bottom)]`}
        style={{ paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' }}
      >
        {content}
      </div>
    )
  }

  return (
    <Portal>
      <div ref={rootRef} data-emoji-picker className="fixed inset-0 z-50 flex flex-col justify-end">
        <div data-testid="emoji-backdrop" aria-hidden="true" onClick={onClose} className="sheet-dim absolute inset-0 bg-black/45" />
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Emoji picker"
          className={`${panelClass} sheet-up h-[54%] flex-none rounded-t-[14px] border-t border-[color:var(--line)] pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_20px_var(--shadow)]`}
        >
          {content}
        </div>
      </div>
    </Portal>
  )
}

/** A custom emoji: picks on tap; desktop hover or focus shows its card; a phone long-press opens its menu. */
function CustomCell({
  row,
  desktop,
  onPick,
  onShowCard,
  onLongPress,
}: {
  row: CustomEmoji
  desktop: boolean
  onPick: (emoji: string) => void
  onShowCard: (id: string) => void
  onLongPress: (row: CustomEmoji, target: Element) => void
}) {
  const label = `:${row.name}:`
  const longPress = useLongPress((el) => onLongPress(row, el.closest('button') ?? el), { enabled: !desktop })
  return (
    <button
      type="button"
      aria-label={label}
      title={desktop ? label : undefined}
      data-custom-emoji={row.name}
      {...longPress}
      onClick={() => onPick(label)}
      onPointerEnter={(e) => {
        if (e.pointerType === 'mouse') onShowCard(row.id)
      }}
      onFocus={desktop ? () => onShowCard(row.id) : undefined}
      className={`grid aspect-square place-items-center rounded-[7px] outline-none transition-colors hover:bg-[color:var(--seg)] focus-visible:bg-[color:var(--seg)] ${
        desktop ? '' : 'touch-pan-y select-none [-webkit-touch-callout:none]'
      }`}
    >
      <img src={row.image_url} alt="" draggable={false} className="pointer-events-none h-[70%] w-[70%] object-contain" />
    </button>
  )
}
