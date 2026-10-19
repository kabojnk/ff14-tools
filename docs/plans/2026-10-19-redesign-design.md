# Sub-project 3: Messenger-style redesign — Design

**Date:** 2026-10-19
**Status:** Look approved by the user through mockups. Spec pending the user's review.
**Roadmap:** `2026-10-18-rework-roadmap.md`
**Depends on:** sub-project 1 (tests), sub-project 2 (conversations, spaces, read positions, statuses, media index)

## Problem

The app still looks and behaves like Discord: a channel sidebar, flat message rows, reactions on one channel per message, and presence that breaks with two devices. Typing on iOS fights autocorrect. Several sub-project 2 features have no visual design yet (read receipts, the status pill, the Main/Schist switch). This sub-project gives the app a polished, Messenger/WhatsApp-style look that is mobile-first and themeable, and fixes the remaining behaviour issues. The FF14 disguise doesn't change.

## Approved look (mockups)

The user approved these private claude.ai pages:
- **Directions:** https://claude.ai/artifact/PQ8ZDahg7XJUniA88jdSUb. **Cozy (C)** was chosen.
- **Themes, Eep! button and ⋮ menu:** https://claude.ai/artifact/5FktQjYSuvFG7pZZgxM74s
- **Status pill, profile editor, media gallery and formatting:** https://claude.ai/artifact/YW8QxjqbYEkHtAgu7kA42b. **Pill A (tinted)** was chosen.

| Decision | Choice |
|---|---|
| Direction | **Cozy** (WhatsApp-like): textured wallpaper, square-ish bubbles with a small tail on the first of a run, the time inside each bubble, ✓/✓✓ read ticks, date chips |
| Main / Schist switch | **The tabs from direction A**: a two-segment control under the header, with an unread dot on the inactive space |
| Icons | **Flat line icons** (Lucide-style SVG). No emoji glyphs as icons |
| Reactions | **Discord-style**: a row of chips under the bubble, one per emoji with a count, your own highlighted, several emoji per message, plus an add-reaction chip |
| Header | Partner avatar with presence dot, name, `online`/last seen, the custom status pill, a **red Eep! button**, and a **⋮ menu** containing Search, Media/files/links, Pinned and Drag the Lake (red, set apart) |
| Status pill | **A (tinted)**: a soft colour wash with a solid dot |
| Themes | **All 11 kept**: Light, Dark, Midnight, Catppuccin Latte, Catppuccin Mocha, Sakura, Rosé Pine Dawn, Rosé Pine, Dracula, Nord, Tokyo Night |
| Formatting | **Discord markdown**: simple-markdown with Discord's rules, plus highlight.js |
| Profile editor | One sheet: banner, avatar, nickname, plain-text status message, Online/Away/Invisible, and the shared custom-status list with inline edit and a swatch palette |
| Media gallery | Kind chips (All, Photos, Videos, GIFs, Files, Links, Voice), an extension box, a This space/Both toggle, and grouping by month |
| iOS | **Capacitor wrapper + TestFlight internal testing** (`2026-10-19-ios-native-research.md`), built after 3a |

The FF14 disguise (Eep mode, the passphrase, the PIN lock flow and the PIN pad) is **unchanged** in look and behaviour. The new Eep! button only triggers it.

## Delivery

| Build | Contents | Ships when |
|---|---|---|
| **3a: core chat** | Theme system, layout, header, tabs, message list, bubbles, reactions, message actions, composer, markdown, typing, presence across devices, read ticks, animations, mobile polish | All of 3a works end to end |
| **3b: you and your stuff** | Profile and status editor, status pill everywhere, media gallery, emoji picker with "add custom emoji", settings redesign | After 3a |
| **4: iOS app** | Capacitor + privacy screen + TestFlight (research doc rollout steps 2–9) | After 3a; can run alongside 3b |
| **Release** | Release rehearsal on real data, deploy, then the contract migration once both phones run the new app | After 3b and 4 |

Each build gets its own implementation plan. This spec covers 3a and 3b. The iOS app gets a short spec of its own when it starts.

---

## 1. Theme system

- **Tokens.** Replace the Discord-era tokens in `src/index.css` with a semantic set covering:
  - wallpaper and wallpaper dot, bar, line
  - their bubble, my bubble and my bubble text, fg, muted
  - accent and on-accent, tick
  - reaction chip, chip-on and chip-on-line
  - field, segment and segment-on, shadow
  - danger
  - presence online/away/offline

  The mockup's token set is the reference. Each theme is one `[data-theme="…"]` block with every token defined.
- **Themes.** The 11 themes use the mockup palettes. The old `dark`/`light`/`midnight` IDs are kept so stored preferences carry over. New IDs: `latte`, `mocha`, `sakura`, `dawn`, `rosepine`, `dracula`, `nord`, `tokyo`.
- **Default.** First run follows the OS (`prefers-color-scheme`) and picks Light or Dark until the user chooses.
- **Contrast.** Every theme must meet WCAG AA, enforced by a unit test that computes the contrast of the token pairs:
  - 4.5:1 for: fg on wallpaper, bar and their bubble; my-bubble text on my bubble; muted on bar and on their bubble; on-accent on accent
  - 3:1 for: accent on bar, and tick on my bubble

  Palettes are adjusted until the test passes.
- **Picker.** In Settings → Appearance: a grid of swatch cards with the theme names. The choice applies instantly and persists per device (localStorage, as today).
- **Status bar.** `meta theme-color` follows the theme's bar colour, so the iOS status area matches.

## 2. Layout

- **Breakpoint.** The desktop layout applies when `(min-width: 900px) and (hover: hover) and (pointer: fine)`. A landscape iPhone (852 px, coarse pointer) therefore stays in the mobile layout, which fixes the issue flagged in sub-project 1. `useMediaQuery` already supports this; only the query changes. Drafts already survive a layout switch.
- **Phone.** With one conversation, the app opens **straight into the chat** (header → tabs → messages → composer). A back chevron in the header leads to a simple conversation list, which today holds one row (Bea) and later holds more. With more than one conversation, the app opens on the list.
- **Desktop.** A left column (240 px):
  - your avatar, name and presence, plus a settings gear
  - "Search messages"
  - the conversation list: avatar, name, last-message preview, time, and an unread badge counting both spaces

  The right side holds the chat: header (with the Main|Schist tabs inline), messages, composer. The media gallery and pins open as a **right-hand slide-over panel** (360 px). The member list is gone; the partner's profile opens from the header avatar.
- **Safe areas.** Header and composer pad with `env(safe-area-inset-*)`. The app uses `height: 100dvh`.
- **Keyboard (iOS).** The composer stays above the keyboard using `visualViewport`. The message list keeps its bottom anchor while the keyboard opens and closes, so there is no jump.

## 3. Chat header

- **Partner identity.** Avatar with a presence dot, name, then a subline: `online` / `away` / `last seen 9:14`, followed by the **status pill (A)** when a custom status is set. Tapping the avatar or name opens the partner's profile card (banner, avatar, name, pill, status message).
- **Eep! button.**
  - **Phone:** a red warning-triangle icon. **Desktop:** a labelled red pill reading "Eep!".
  - It calls `setEepMode(true)` straight away. **There is no confirmation**, because speed matters and returning needs the passphrase.
  - It has `aria-label="Eep!"`, and on desktop the keyboard shortcut **Esc Esc** still works as it does today.
- **⋮ menu:** Search messages · Media, files & links · Pinned messages · divider · **Drag the Lake** (red). On desktop, the media button also sits in the header.
- **Tabs.** A two-segment control. The inactive space shows a dot when unread. Switching animates the highlight (120 ms) and keeps each space's scroll position and draft.

## 4. Messages

- **Bubbles.**
  - Mine sit on the right in `--me`; theirs on the left in `--them`. Max width 78% on phone, 62% on desktop.
  - Consecutive messages from one author within 5 minutes form a **run**: 2 px gap, and a tail on the first bubble only.
  - The time is tucked inside the bubble at the bottom right. "edited" shows before the time.
- **Date chips.** TODAY / YESTERDAY / weekday (within 7 days) / date, centred, inserted wherever the day changes.
- **New messages divider.** When you open a space with unread messages, a "New messages" line sits above the first unread one, and the view starts there instead of at the bottom.
- **Jump to latest.** When you're scrolled up more than one screen, a round button appears above the composer with the number of unseen messages. Tapping it scrolls to the bottom smoothly.
- **Read ticks** (my messages only):
  - **clock:** sending
  - **single ✓:** sent
  - **blue ✓✓:** read (Bea's `read_positions.last_read_at` ≥ message time)
  - **red ! with Retry:** failed

  When either person has read receipts off, a sent message stays at single ✓. That follows from the database rule (RLS) that hides read positions.
- **Replies.** The existing reply feature is kept. A reply shows a quoted strip (author plus a one-line snippet) at the top of the bubble, and tapping it scrolls to the original and flashes it.
- **Media.**
  - **Images and video:** rounded to the bubble, with the time overlaid on a scrim. A run of several images forms a grid of up to 4 with "+N".
  - **GIFs:** autoplay muted, honouring reduced motion.
  - **Files:** a file row (icon with an extension badge, name, size).
  - **Spoilers:** blurred until tapped.
- **Links.** Links are shown as underlined, clickable text. No previews are fetched, consistent with sub-project 2.
- **Deleted messages** disappear, as today.
- **System messages** (for example "Bea dragged the lake") show as date-chip-style centred notes.

## 5. Reactions

- **Display.** Chips under the bubble, aligned to the bubble's side.
  - Each chip shows the emoji, or a custom `:name:` emoji image, plus a count.
  - Your own reaction is highlighted with `chip-on` and `chip-on-line`.
  - The chips are ordered by when each emoji was first used.
  - A final **add-reaction chip** appears on hover (desktop) and always on phone, but only once the message already has reactions.
- **Adding and removing.** Tapping a chip toggles your reaction. To add one:
  - **Phone:** long-press the message for a quick bar of 6 recent emoji plus "+".
  - **Desktop:** the hover toolbar.

  "+" opens the full emoji picker, including custom emoji.
- **Realtime fix.** Drop the **one realtime channel per message**. Reactions arrive through `postgres_changes` on `reactions` within the existing `conv:<id>` channel (RLS already scopes them to members) and live in a `reactionStore` keyed by message ID. Reactions for the loaded page are fetched in one query.
  - DELETE events under RLS carry only the primary key, so the store keeps an `id → message_id` index to apply removals.
  - This removes the risk of hitting the Supabase channel limit, and the rate-limit flakiness found in sub-project 2.
- **Who reacted.** Long-pressing (phone) or hovering (desktop) a chip shows who reacted.

## 6. Message actions

- **Phone:** long-press the bubble to lift it (scale 1.02, background dimmed) and show the quick reaction bar above it and an action sheet below: Reply · Copy · Edit (mine) · Pin/Unpin · Delete (mine, red, with a confirmation).
- **Desktop:** a hover toolbar at the bubble's top corner: react · reply · ⋯ (Copy, Edit, Pin, Delete). Keyboard shortcuts while hovering: `R` reply, `E` edit.
- **Edit:** inline in the composer with an "Editing message" bar. Esc cancels.
- **Swipe to reply on phone** (swipe the bubble right): included in 3a if it can be done without fighting iOS scroll, otherwise deferred. The implementer decides from a device test.

## 7. Composer

- **Layout.** A rounded field holding an emoji button (left), the text area (auto-grows to 6 lines, then scrolls), and GIF and attach buttons (right). The round **send** button sits outside the field.
  - The mic button is reserved for voice memos. Until those exist, **send is always shown**, disabled while the field is empty.
- **Typing on iOS.** Set `autoCorrect="on"`, `autoCapitalize="sentences"`, `spellCheck`, `enterKeyHint="send"` and `inputMode="text"`.
  - Keep the textarea's value updates free of anything that resets the caret or composition: no `value` rewrites during IME composition (`compositionstart`/`compositionend`) and no transforms of the typed text.
  - A device check confirms that predictive text and autocorrect work (added to the iPhone checklist).
- **Enter.**
  - **Desktop:** Enter sends and Shift+Enter adds a new line.
  - **Phone:** Return adds a new line and the send button sends, which is the iOS convention. Using a hardware keyboard on a phone falls back to the desktop behaviour.
- **Drafts, slash commands and the typing indicator** keep their current behaviour. That includes the stop-typing fix and `/eep` and `/drag`.
- **Attachments** show as removable thumbnails above the field while uploading, with a progress ring.
- **Formatting toolbar.** None. Markdown is typed, as in Discord.

## 8. Markdown (Discord flavour)

- **Parser.** Replace `src/lib/markdown.ts` and `MarkdownRenderer` with `simple-markdown` configured with Discord's rule set:
  - text: `**bold**`, `*italic*`/`_italic_`, `__underline__`, `~~strike~~`, `||spoiler||`
  - code: `` `inline` ``, fenced ```` ```lang ```` blocks
  - headers: `#`/`##`/`###`, and `-#` subtext
  - lists: `-`/`*` and `1.`, nested by indent
  - quotes: `>` (one line) and `>>>` (to the end of the message)
  - links: `[masked links](https://…)` and autolinks
  - custom emoji: `:name:`

  Styles nest (for example `***__all__***`).
- **Code.** `highlight.js` core, with languages loaded on demand per fence. Supported: js, ts, json, css, html/xml, bash, python, sql, yaml, markdown, plus a plaintext fallback. Token colours come from theme tokens, so code stays readable in all 11 themes. Each code block gets a copy button (on hover, or via long-press → Copy).
- **Safety.** No raw HTML. Links render with `rel="noopener noreferrer"`, `target="_blank"`, and only `http(s)` or `mailto:` are allowed. Masked links show the real URL in their title.
- **Tests.** The existing markdown characterisation tests are rewritten against the new renderer, plus cases for nesting, `>>>`, lists, `-#`, the spoiler toggle, unknown languages and script-injection attempts.

## 9. Presence and typing across devices

- **Presence.** Each device tracks presence under a key of `<userId>:<deviceId>` (a random ID stored in localStorage). A user's displayed state is the **most-online** across their devices (online > away > offline), and "last seen" is the latest.
  - Backgrounding one device no longer marks the user offline everywhere.
  - Manual Away and Invisible apply to all of that user's devices: they're written to the profile, and every device respects them.
- **Typing.** Typing is per space on the conversation channel, as sub-project 2 left it. The indicator is a typing bubble with animated dots in the message list, not a text line. The old text line moves into the header subline ("typing…").

## 10. Motion

- **Animations:**
  - **New message:** fades and rises 6 px in 160 ms.
  - **Sent bubble:** springs in from the composer, about 200 ms.
  - **Reaction chip:** pops in.
  - **Tabs:** the highlight slides between them.
  - **Panels and sheets:** slide in.
  - **Typing dots:** bounce.
- **Limits.** `prefers-reduced-motion` turns animation off and keeps only opacity fades. Nothing animates on the initial history load.

## 11. 3b: profile, status, gallery, emoji, settings

- **Profile and status editor.** Per the mockup.
  - It opens from your avatar (desktop left column, or the phone list screen's header) and from Settings → Profile.
  - Edits save with a Save button, except the status list, where selection and inline edits apply immediately as sub-project 2's store already does.
  - The swatch palette has 11 presets plus a custom colour input.
- **Pill A everywhere** a custom status shows: the header subline, the conversation list row, profile cards and your own column.
- **Media gallery.** Per the mockup, on top of sub-project 2's `useMediaGallery`.
  - Thumbnails are grouped by month, video shows its duration, and GIFs get a badge. Files and Links are lists.
  - Tapping a photo opens a full-screen viewer with swipe between items and **"Show in chat"**, which scrolls to and flashes the message, switching space if needed.
- **Emoji picker.** Tabs for Recent · Custom · standard categories, plus search.
  - **"Add emoji"** (in the Custom tab): pick an image, crop it square, enter a name (`a-z0-9_`, 2–32 characters, unique) and upload through the existing Bunny flow. Any member can add custom emoji, and any member can delete them (with a confirmation).
  - `:name:` tokens are unchanged.
- **Settings redesign.**
  - **Phone:** a sheet with sections. **Desktop:** a dialog with a left nav.
  - The sections are:
    - **Profile:** opens the editor.
    - **Appearance:** theme grid.
    - **Security:** PIN, lake, read receipts (the existing LakeSettings, restyled).
    - **Notifications:** placeholder, iOS app only.
    - **About:** version.
  - Log out lives under Security, as today.

## Error handling

- **Failed sends** keep the bubble with a red "!" and **Retry**. The draft isn't lost. A failed upload shows on its thumbnail with Retry and Remove.
- **Realtime status.** While the conversation channel isn't joined, a slim "Reconnecting…" bar shows under the header after 2 s. On rejoin it disappears, and the existing refetch-on-rejoin catches up.
- **Reactions** are optimistic, and roll back with a quiet toast if the server refuses.
- **Theme load.** An unknown stored theme ID falls back to the OS default.
- **Markdown.** If the parser throws, the plain text is rendered.

## Testing

- **Unit:**
  - the theme contrast matrix (all 11 themes × token pairs)
  - markdown renderer cases
  - `reactionStore`, including deletes with only the primary key
  - presence aggregation (most-online across devices)
  - run grouping, date chips and the new-messages divider placement
  - tick state, from message time vs read position vs receipts
- **Component tests:** header (Eep button triggers eep mode, menu items), tabs (unread dot), composer (Enter vs Return per layout, the composition guard), reaction chips (toggle, add).
- **Two-user end-to-end tests** (both projects):
  - **Reactions:** Bea sees Alice's reaction chip live and toggles her own; counts merge.
  - **Read ticks:** Alice's message shows ✓, then ✓✓ once Bea reads it; it stays ✓ when Bea has receipts off.
  - **Presence:** Bea on two devices; one goes to the background, and Alice still sees Bea online.
  - **Eep!:** the button shows the disguise immediately.
  - **New messages:** the divider and jump-to-latest count.
  - **Layout:** landscape iPhone size (852×393, touch) stays in the mobile layout.
  - **Markdown:** a code block renders highlighted and has a copy button.
  - **Theme screenshots:** one screenshot per theme of the chat screen (desktop and phone), compared against committed baselines (`toHaveScreenshot`) on Chromium only, with masks over times.
  - **Realtime load:** no realtime channel per message. A test asserts the channel count stays constant as messages load.
- **iPhone checklist:** add autocorrect and predictive text, the keyboard not covering the composer, safe areas in all orientations, long-press actions, and the Eep! button.

## Concerns checklist (defaults; no `jig.config.md`)

| Concern | Applies | Notes |
|---|---|---|
| Error handling | Yes | See the section above |
| Security | Yes | Markdown: no raw HTML, link-scheme allowlist, `noopener`. Custom emoji uploads keep the existing size and type checks in `upload-media`. No schema change in 3a. 3b needs custom emoji delete for any member, which matches the current RLS. |
| Test strategy | Yes | See the section above, including visual baselines per theme |
| Accessibility | Yes | AA contrast tests; icon buttons have labels; the tabs are `role="tablist"`; reaction chips are buttons with `aria-pressed`; reduced motion is respected |

## Out of scope

- Voice memos. The mic slot is reserved.
- Link previews. No server-side fetching.
- More than one conversation in the UI beyond the simple list.
- Message search redesign beyond moving it into the ⋮ menu and restyling the results.
- The iOS wrapper itself (separate spec).
- The contract migration and the release (separate step).
