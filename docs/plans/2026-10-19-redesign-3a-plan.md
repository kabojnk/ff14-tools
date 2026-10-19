# Redesign 3a (Core Chat) Implementation Plan

> **Design:** docs/plans/2026-10-19-redesign-design.md (sections 1–10, 4a, error handling, testing)
> **Mockups (approved):**
> - https://claude.ai/artifact/5FktQjYSuvFG7pZZgxM74s (themes, header, Eep!, ⋮ menu, reactions)
> - https://claude.ai/artifact/YW8QxjqbYEkHtAgu7kA42b (pill A, formatting)
>
> The token values and the markup structure in those pages are the visual reference. Their HTML is in the session scratchpad and can be re-read with the Artifact tool (`action: "read"`).
>
> **For agents:** use team-dev to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax. Implementers follow the `tdd` skill (red → green → refactor).
>
> **Gate for every task:** `npx tsc -b && npm run lint && npm test` (0 lint errors). Any task that touches the database also runs `npm run test:db`. From Task 6 onward, every task also runs `npm run db:reset && npm run e2e` (full suite, both projects).

**Goal:** Rebuild the chat in the approved Cozy look, with:
- 11 contrast-checked themes and the new layout (straight into the chat on phones, a left column on desktop)
- a header with presence, pill A, the red Eep! button and the ⋮ menu, plus the Main|Schist tabs
- Cozy bubbles with runs, date chips, read ticks, a new-messages divider and jump-to-latest
- Discord-style reactions on the single conversation channel, and message actions
- spoiler media, including marking after posting
- a composer that works with iOS autocorrect
- Discord markdown with code highlighting
- presence that works across devices, and restrained motion

The FF14 disguise is untouched.

**Architecture.**
- **Themes.** Semantic CSS tokens live in `src/styles/themes.css`, one block per theme. The existing utility names (`bg-primary`, `text-muted` and the rest) are re-pointed at the new tokens, so screens that 3a doesn't redesign (settings, login, profile modals) follow every theme until 3b restyles them.
- **Logic.** Pure, unit-tested helpers in `src/lib/chat/` handle:
  - run grouping
  - date chips
  - tick state
  - divider index
  - presence aggregation
  - reaction deltas
- **Components.** They live in `src/components/chat2/` while the old ones are retired, then get renamed. The task that switches `AppShell` deletes the old components in the same commit.
- **Realtime.** Reactions move onto the existing `conv:<id>` channel (`postgres_changes`) and a `reactionStore`. Per-message channels go away.

**Tech stack additions.**
- `lucide-react` (icons)
- `@khanacademy/simple-markdown` 4.x (maintained fork of the parser Discord uses)
- `highlight.js` 11 (core, with languages loaded on demand)

No other runtime dependencies.

**Commit convention:** a short imperative subject, ending with
```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

**Production safety:** No task touches hosted Supabase or pushes. Task 4's migration is additive.

## Plan review amendments (override the task text below where they conflict)

Two reviewers checked this plan against the code, the library sources and the local database. Their fixes are listed here by task, and implementers must apply them. Where an amendment contradicts a task's text, **the amendment wins**.

**T0 (lead, before the parallel tasks): dependencies.** Install `lucide-react`, `@khanacademy/simple-markdown` and `highlight.js` in one commit, so that no parallel task touches `package-lock.json`. Also create `src/components/ui/Icon.tsx`.

**T1 themes**
- **First paint.** Put the default (dark) token values on `:root` as well as `[data-theme="dark"]`. Set `data-theme` **synchronously**, from an inline script in `index.html` that reads the same localStorage key with a try/catch, so the first frame is already themed.
- **The disguise never shows the chat theme.**
  - While `eepMode` is on, `theme-color` is the FF14 bar colour `#1a1a2e`.
  - `LoginPage` is pinned to fixed FF14-style colours, not the legacy utilities.
  - The pre-auth "Loading…" screen renders the disguise when `eepMode` is on (otherwise a neutral fixed-colour screen), never theme colours.
  - `EepMode` and `PinPad` already use inline colours, so leave them alone.
- **Legacy remap.** Cover every legacy use: grep `hsl(var(--color-` (95 uses in 24 files), including `text-link`, `text-interactive-hover`, `bg-brand-hover`, `text-danger`, scrollbars, the spoiler variables and arbitrary classes such as `focus:border-[hsl(var(--color-brand))]`. `lib/status.ts` presence colours read `--presence-*`, and its test is updated.
- **Contrast pairs to add:**
  - At least 4.5:1: `accent` (links) on `them` and on `me`; the time and "edited" colour on `me` and on `them`; date-chip text on `bar`.
  - At least 3:1: every `--code-*` token on `--code-bg`.

  The parser **fails** on any tested token that isn't a plain hex or opaque `rgb()`, rather than skipping it.

**T2 markdown**
- **Parse mode.** `simple-markdown` 4.x has a default export only (`SimpleMarkdown.defaultRules`, `.parserFor`, `.outputFor`). Parse with `{ inline: true }`. Heading, list, quote (`>` and `>>>`), fence and `-#` are re-implemented as **inline-mode rules gated on line start** (the previous capture ends with `\n`, or it's the start of the message), the way Discord does it. The default block rules return null in inline mode. `u` (underline) already exists among the defaults.
- **Output.** Write every rule's React output with `React.createElement`. Don't use the package's built-in `react` output, which builds element objects by hand.
- **Links.** Keep the plan's link allowlist; the built-in sanitiser only blocks `javascript:`, `vbscript:` and `data:`.
- **Robustness.** Memoise the parsed output per content string with a small cache. Any parser error falls back to plain text.
- **highlight.js.** Use an explicit import map, for example `{ js: () => import('highlight.js/lib/languages/javascript'), … }`. A template-string `import()` won't resolve in Vite. Highlighting lands after the first paint, so `MessageList` re-pins to the bottom when a code block finishes highlighting if it was at the bottom.

**T3 database: add presence columns; harden spoiler and reply**
- **Spoiler parsing.** In `rebuild_message_media`, use `coalesce(a->'spoiler' = 'true'::jsonb, false)` for the spoiler flag. A malformed value must never break an insert or the migration.
- **Backfill.** Replace the full-rebuild backfill with `update public.message_media mm set spoiler = true from public.messages m, jsonb_array_elements(m.attachments) a where mm.message_id = m.id and mm.url = a->>'url' and a->'spoiler' = 'true'::jsonb and not mm.spoiler`. That keeps row IDs, and a re-run changes nothing.
- **`set_attachment_spoiler` checks.** It requires all of:
  - `jsonb_typeof(attachments->p_index) = 'object'`
  - an attachment `type` of image, video or gif
  - a **visible** session
  - a non-deleted message

  Otherwise it raises `22023`.
- **Reply check.** The reply trigger fires on `update of reply_to, conversation_id`.
- **Presence storage (new; reviewer finding: `profiles.status` defaults to `'offline'`, so it can't mean Invisible):**
  - `profiles.presence_override text check (presence_override in ('away', 'invisible'))`, default null.
  - `profiles.last_seen_at timestamptz`.
  - RPC `touch_last_seen()`: `security definer`, empty `search_path`, sets the caller's `last_seen_at = now()`, executable by `authenticated` only.
  - pgTAP tests for both columns and the RPC.
  - `profiles.status` is left as it is for old apps.
- **Seed and restore.** Update the seed and `e2e/supabase.ts` `restoreStatuses()` to reset `presence_override` to null.

**T4 logic.** Date chips show the weekday name for messages within **7** days, matching the spec.

**T5 presence**
- **`displayed()`** reads `profile.presence_override`: `'away'` gives away, `'invisible'` gives offline, null gives the aggregate. It never reads `profiles.status`.
- **Payload.** Send `{ user_id, device_id, presence, status: <legacy mapping of presence>, at }` so cached old apps still read `status`. When `aggregate` gets a payload with no `presence`, it maps `status` through `presenceOf()`.
- **Aggregation** iterates **every** presence entry. Two tabs share a `device_id`, so it can't key by `device_id`.
- **Re-track** the **current** state on every `SUBSCRIBED`. Today the subscribe closure re-sends the initial state.
- **Last seen.** Call `touch_last_seen()` on `pagehide` and on hide, and send a heartbeat every 60 s while visible. "Last seen" comes from `profiles.last_seen_at`, live through the profile binding added in T7. Don't use presence `at`, because a suspended iPhone simply drops off the channel.
- **No idle detector.** Presence is online while visible and offline (for that device) while hidden. "Away" exists only as a manual override. Drop "away while idle".
- **StatusPicker.** Away and Invisible write `presence_override`, and Online clears it.

**T6 layout and launch**
- **Launch state.**
  - Touch `hasPin`/`pinLocked` only after a **successful** `loadPin` response, and set `pinLocked = false` when the length is null.
  - Remove `hasPin` in `authStore.signOut`, which covers every logout path.
  - The `uiStore` launch-state tests use `vi.resetModules()`, because the state is computed when the module loads.
- **Passphrase while locked.** In `EepMode`, while `pinLocked`, a correct passphrase **opens the PIN pad** instead of the chat. This closes the gap before the PIN length loads. Add a unit test.
- **e2e setup.**
  - `auth.setup.ts` removes `hasPin` from the saved storageState.
  - Add a `ChatUser.unlockIfLocked()` helper.
  - The launch test injects `hasPin` with `addInitScript`.
  - The "no PIN" reload case clears Bea's PIN with the service client and restores it afterwards.
- **Landscape check.** Use **932×430** (`hasTouch`, `isMobile`) on Chromium only. It's wider than 900 px with a coarse pointer, so it actually tests the pointer and hover rule.
- **Carry over from the old `AppShell`:** the Esc-Esc and Ctrl+Shift+E Eep shortcuts, and the `visualViewport` keyboard handling.
- **StatusPicker's new home.** It opens from the desktop left column's me-row and from the phone list screen's avatar.
- **e2e for statuses.** `statuses.spec` stops using `openMembers`/`member()`. It uses `partnerCard()` (T7) and the left-column me-row.
- **Draft test.** The draft-across-breakpoint e2e runs on `chromium-desktop` only, because a coarse pointer never crosses the breakpoint.
- **Safe areas.** The header and composer pad with `env(safe-area-inset-*)`.

**T7 header**
- **Live profiles (new).** Add a `profiles` UPDATE `postgres_changes` binding on the conversation channel, filtered `id=in.(<memberIds>)`, feeding a small `profileStore`. It must **drop `lock_pin`** from the payload and never store it. This replaces the subscriptions in `MemberList` and the old `MessageList`, which T6 and T8 delete. Header, pill, presence override and last seen all read from it.
- **Keep the e2e hooks:** the `data-realtime` attribute on the message list container, and the composer placeholder `Message #<Space>`.
  - `dragTheLake` and `openInfoPanel` in the e2e fixtures move to the new menu (`menuitem` roles, new item names).
  - The pink-colour assertion in `statuses.spec` checks the pill dot's colour, not the `color-mix` text.

**T8 message list**
- **Client-generated IDs.** Don't match pending messages on content. The client generates `messages.id` with `crypto.randomUUID()` and uses it as the pending key. `addMessage` merges into the pending entry by ID. A retry that gets `23505` counts as success.
- **Interim behaviour until T9–T11.** Extract the old `MessageItem`'s reaction row, context menu (edit, delete, pin, copy, reply) and **inline edit** into `components/chat/legacy/LegacyMessageExtras.tsx`, rendered inside the new `MessageRow`. That way the existing behaviour and specs keep working. T9 replaces the reactions, T10 the menu, and T11 the edit (moved into the composer).
- **`ChannelInfoPanel`** imports `MarkdownRenderer`. Switch it to the new `Markdown` here.
- **Typing bubble.** `TypingBubble` has an accessible name, `"<Name> is typing"`, which keeps the e2e `typing()` helper working.
- **Scroll position.** Each space's scroll position is kept when switching tabs (a per-`spaceKey` map).
- **Spoilers.** The `MediaBlock` key includes the spoiler flag, so a re-marked item blurs again. The full-screen viewer and the current media tab blur spoilers too.
- **Read ticks.** `partnerReadAt` clears when either person's `read_receipts` turns off, using the profile store from T7.
- **Accessibility.** Ticks, `JumpToLatest` and the typing bubble have labels.

**T9 reactions**
- **DELETE events** carry only the primary key and reach every subscriber, so the store must treat **unknown IDs as no-ops**.
- **INSERT** dedupes on `(message_id, user_id, emoji)` and replaces the optimistic row with the server ID.
- **Reload.** Re-run `loadFor` for loaded messages on rejoin and after a lake reload.
- **Motion.** Reaction chips pop in.

**T10 actions**
- **Long-press.**
  - Use pointer events: `pointercancel` aborts when iOS starts a scroll. Set `touch-action: pan-y`.
  - Set `-webkit-touch-callout: none` and `user-select: none` on bubbles, and `draggable={false}` on media.
  - The e2e test triggers it with `pointerdown`, then a wait, then `pointerup`.
- **Hover toolbar** renders only when `isDesktop`.
- **Shortcuts.** R and E are scoped to a focused message row (`tabIndex={0}`), not the window. The action sheet is also reachable from the keyboard through a "More actions" button inside each row, for screen-reader users.
- **Edit** moves to T11 (composer editing). T10 only wires the menu item to it, through a `composerStore.startEdit(message)` stub that T11 implements.
- **Motion.** The sheet slides up.

**T11 composer**
- **Phone Return rule.** On phones (non-desktop layout), Return **always** inserts a newline. Drop the hardware-keyboard detection, which can't be detected reliably.
- **Safari composition.** Ignore Enter when `e.nativeEvent.isComposing`, when `e.keyCode === 229`, or within the same tick as a `compositionend`. Safari fires `compositionend` before the Enter `keydown`. Unit-test that event order.
- **e2e.** `ChatUser.send()` clicks **Send** in the mobile layout, and so do the three spec calls that press Enter (`messaging.spec.ts` 40 and 61, `lake.spec.ts` 42).
- **Composer editing** comes here (from T10). The composer keeps the iOS keyboard from covering it, using `visualViewport`.

**T12 screenshots**
- **CI.** `updateSnapshots` is a top-level config option only, so use a separate CI step: `npx playwright test --project=screenshots-desktop --project=screenshots-phone --update-snapshots=missing`. Upload the `*-snapshots` folders with `if: always()`, in their own artifact.
- **Projects.** Pin `runs-on: ubuntu-24.04`. Use two projects (desktop 1280×800, phone 393×852 with a coarse pointer). The other projects `testIgnore` the screenshot spec.
- **Masks:** times, date chips, presence and typing. Wait for code highlighting before taking the shot.

## Task graph

```
Parallel (no e2e):   T1 themes ─┐   T2 markdown ─┐   T3 spoiler DB ─┐   T4 chat logic ─┐   T5 presence ─┐
                                └──────────────────────────────────────────────────────────────────────┴─→
Sequential (e2e):    T6 layout+launch ─ T7 header+tabs ─ T8 message list ─ T9 reactions ─ T10 actions+spoilers ─ T11 composer ─ T12 e2e+visual+docs
```
- T1–T5 each touch separate files and run only unit tests and the database tests (T3 is the only one using the database), so they can run in parallel worktrees.
- T6 onwards runs end-to-end tests on the single local stack, one task at a time.

## File structure

| File | Action | Responsibility |
|---|---|---|
| `src/styles/themes.css` | Create | 11 theme token blocks, plus the presence and danger tokens |
| `src/index.css` | Modify | Import themes; re-point the legacy utilities at the new tokens; base font and wallpaper |
| `src/lib/themes.ts` (+ test) | Create | Theme list (IDs, names, kinds, swatches), OS default, contrast matrix test |
| `src/stores/uiStore.ts` (+ test) | Modify | `ThemePreset` widened; OS default; phone-launch-with-PIN initial state; `hasPin` device flag |
| `src/components/ui/Icon.tsx` | Create | Thin wrapper over `lucide-react` (size and stroke defaults) |
| `src/lib/markdown/*` (+ tests) | Replace | Discord rule set on simple-markdown → React nodes; highlight.js loader |
| `src/components/chat2/Markdown.tsx` | Create | Renderer component, spoiler toggle, code block with copy |
| `supabase/migrations/20261020090000_attachment_spoiler.sql` | Create | `message_media.spoiler`, rebuild update, `set_attachment_spoiler` RPC |
| `supabase/tests/database/070_spoiler.test.sql` | Create | pgTAP for the spoiler RPC and media column |
| `src/lib/chat/{runs,dates,ticks,divider}.ts` (+ tests) | Create | Pure message-list logic |
| `src/lib/presence.ts` (+ test) | Create | Device ID, most-online aggregation, manual override |
| `src/stores/presenceStore.ts`, `src/hooks/usePresence.ts` | Modify | Track per device; aggregate; stop marking the user offline everywhere when one device hides |
| `src/components/layout/AppShell.tsx` | Rewrite | Phone: chat first, list behind a back chevron. Desktop: left column, chat, right slide-over. New breakpoint query |
| `src/components/layout/LeftColumn.tsx`, `ConversationList.tsx`, `SlideOver.tsx` | Create | Desktop column, list rows (phone and desktop), right panel |
| `src/components/chat2/ChatHeader.tsx`, `SpaceTabs.tsx`, `StatusPill.tsx`, `EepButton.tsx`, `ChatMenu.tsx`, `PartnerCard.tsx`, `ReconnectBar.tsx` | Create | Header, tabs, pill A, Eep!, ⋮ menu, partner profile, reconnect notice |
| `src/components/chat2/MessageList.tsx`, `MessageRow.tsx`, `Bubble.tsx`, `DateChip.tsx`, `NewDivider.tsx`, `JumpToLatest.tsx`, `TypingBubble.tsx`, `MediaBlock.tsx`, `ReplyStrip.tsx`, `Ticks.tsx` | Create | Message list in the Cozy look |
| `src/stores/reactionStore.ts` (+ test), `src/lib/conversationRealtime.ts` | Create / Modify | Reactions by message; `reactions` `postgres_changes` on the conversation channel |
| `src/components/chat2/Reactions.tsx`, `QuickReactBar.tsx` | Create | Chips, add chip, who-reacted, quick bar |
| `src/components/chat2/MessageActions.tsx` (`ActionSheet` and `HoverToolbar`) | Create | Phone long-press sheet; desktop hover toolbar; spoiler mark/unmark |
| `src/components/chat2/Composer.tsx`, `PendingAttachments.tsx` | Create | New composer; autocorrect-safe; spoiler toggle; upload progress |
| `src/stores/messageStore.ts` (+ test), `src/stores/conversationStore.ts` | Modify | Pending/failed local messages with retry; the partner's read position per space |
| Old: `components/chat/{MessageList,MessageItem,MessageInput,TypingIndicator,MarkdownRenderer,MessageContextMenu,ReactionPicker}.tsx`, `components/channels/ChannelHeader.tsx`, `components/spaces/SpaceList.tsx`, `components/layout/{Sidebar,MobileNav}.tsx`, `components/user/{MemberList,UserPanel}.tsx`, `lib/markdown.ts` | Delete (in the task that replaces each) | Superseded |
| `e2e/*` | Modify / Create | Selectors, new specs, theme screenshots |
| `.github/workflows/ci.yml`, `playwright.config.ts` | Modify | Screenshot project (Linux only) and artifact upload |
| `docs/testing/iphone-checklist.md`, roadmap | Modify | New device checks; status |

---

### Task 1: theme system (11 themes, contrast-tested)

**Files:** `src/styles/themes.css`, `src/index.css`, `src/lib/themes.ts` (+ test), `src/stores/uiStore.ts` (+ test), `src/App.tsx` (theme-color meta), and `src/components/user/UserSettings.tsx` (the existing Appearance list, extended to 11 entries; the visual redesign is 3b)

- [ ] **Tokens.** Define the semantic tokens as plain colour values (hex or `rgb`), with one `[data-theme="<id>"]` block per theme. Copy the values from the themes mockup's `.app[data-app-theme=…]` blocks. The tokens are:
  ```
  --wall --wall-dot --bar --line --them --me --me-fg --fg --muted --accent --on-accent --tick
  --chip --chip-on --chip-on-line --field --seg --seg-on --shadow --danger --on-danger
  --presence-online --presence-away --presence-offline
  --code-bg --code-fg --code-keyword --code-string --code-number --code-title --code-comment
  ```
  The theme IDs are `light dark midnight latte mocha sakura dawn rosepine dracula nord tokyo`.
- [ ] **Legacy utilities.** Re-point them in `index.css` so un-redesigned screens follow the theme. For example:
  - `bg-primary` → `var(--wall)`
  - `bg-secondary` and `bg-tertiary` → `var(--bar)`
  - `bg-floating` → `var(--bar)`
  - `bg-hover` and `bg-active` → `var(--seg)` and `var(--seg-on)`
  - `text-primary` → `var(--fg)`
  - `text-secondary` and `text-muted` and `text-interactive` → `var(--muted)`
  - `text-brand` and `bg-brand` → `var(--accent)`
  - `bg-danger` → `var(--danger)`
  - `bg-input` → `var(--field)`, and `border-input` → `var(--line)`

  The old HSL variables become unused; delete them. Grep `hsl(var(--color-` across `src/`, replace every use, and delete the leftovers.
- [ ] **`src/lib/themes.ts`.** Export `THEMES: { id, name, kind: 'light' | 'dark', pink?: boolean, swatches: [string, string, string] }[]`, `isThemeId(x)` and `defaultTheme(prefersDark: boolean)`.
- [ ] **Contrast test, written first.** `src/lib/themes.test.ts` parses `src/styles/themes.css` with `fs` and a small regex, then checks every theme with WCAG 2.1 relative luminance:
  - **At least 4.5:1:** `fg` on `wall`, `bar` and `them`; `me-fg` on `me`; `muted` on `bar` and on `them`; `on-accent` on `accent`; `on-danger` on `danger`; `code-fg` on `code-bg`.
  - **At least 3:1:** `accent` on `bar`; `tick` on `me`; `danger` on `bar`.

  Adjust palette values until it passes. Keep each theme's character, and nudge lightness rather than changing hue. List every adjusted value in the commit body.
- [ ] **`uiStore`.**
  - `theme` initialises from localStorage when `isThemeId`. Otherwise it uses `defaultTheme(matchMedia('(prefers-color-scheme: dark)').matches)`.
  - Wrap localStorage in `try`/`catch`.
- [ ] **`App.tsx`.** Set `<meta name="theme-color">` from the computed `--bar` whenever the theme changes, creating the meta tag if it's missing.
- [ ] **Settings.** Show all 11 themes as swatch cards, using the existing settings styling.
- [ ] **Unit tests:** unknown stored ID falls back to the OS default; all 11 IDs round-trip.
- [ ] Commit: `Add the 11-theme token system with contrast tests`

### Task 2: Discord markdown

**Files:** `src/lib/markdown/rules.ts`, `src/lib/markdown/highlight.ts`, `src/lib/markdown/index.ts` (+ tests), `src/components/chat2/Markdown.tsx` (+ test). Install `@khanacademy/simple-markdown` and `highlight.js`.

- [ ] **Rules.** Build on `defaultRules`, keeping only the rules Discord supports and adding Discord's own.
  - **Inline styles:** `**strong**`, `*em*` and `_em_`, `__underline__` (a custom rule whose order is before `em`), `~~del~~`, `||spoiler||` (custom).
  - **Code:** `` `inlineCode` `` and fenced ```` ```lang ```` blocks.
  - **Headings:** `heading` for `#`, `##` and `###` only, at the line start, followed by a space. `-# subtext` is a custom rule.
  - **Lists:** `list` for `-`, `*` and `1.`, nested by indentation.
  - **Quotes:** `blockQuote` for `>` (the line) and `>>>` (to the end of the message). Both are custom, matching Discord.
  - **Links:** `link` for `[text](url)` (masked) and `autolink`/`url`.
  - **Custom emoji:** `:name:` (custom), resolved through the existing custom-emoji lookup.
  - **Text and breaks:** `text`, plus `br` on a single newline (Discord keeps line breaks).
  - **Disabled:** tables, images, `def`/`reflink`, raw HTML and setext headings.
- [ ] **Output.** The renderer produces React elements, never `dangerouslySetInnerHTML`.
  - **Links:** `target="_blank"` and `rel="noopener noreferrer"`. Only `http:`, `https:` and `mailto:` are allowed; anything else renders as text. Masked links carry `title={href}`.
- [ ] **Code blocks.** `highlight.ts` exports `highlight(code, lang): Promise<string | null>`.
  - It lazily imports `highlight.js/lib/core` and the language modules: javascript (also `js`), typescript (`ts`), json, css, xml (`html`), bash (`sh`), python (`py`), sql, yaml (`yml`), markdown (`md`).
  - Unknown or missing language gives `null`, and the block renders as plain monospace.
  - The highlighted HTML comes from highlight.js's escaped output, so it is safe. It's rendered through a small `HighlightedCode` component using `dangerouslySetInnerHTML` on that output only, with a comment explaining why that is safe.
  - Token colours come from the `--code-*` tokens through `.hljs-*` class mappings in `themes.css`.
  - Each block has a language label and a **Copy** button (shown on hover, and always on touch), using `navigator.clipboard.writeText` with a `try`/`catch`.
- [ ] **Spoiler.** Hidden until clicked or tapped; the reveal is per element and per viewer.
- [ ] **Tests, written first.**
  - Port the 9 existing characterisation cases to the new API and keep their intent.
  - Add:
    - **Nesting:** `***__x__***`.
    - **Quotes:** `>>>` spanning multiple lines; `>` on one line only.
    - **Lists:** nested lists; numbered lists.
    - **Headings and subtext:** `#` only at the line start; `-#` subtext.
    - **Spoiler:** reveals when toggled.
    - **Links and emoji:** a masked link's title; a `javascript:` link becomes text; `:moogle:` becomes an `img` with alt `:moogle:`.
    - **Injection:** `<img onerror>` stays literal text.
    - **Code:** an unknown language falls back to plain; the copy button calls the clipboard.
- [ ] Don't wire it into the app yet; Task 8 does. Delete `src/lib/markdown.ts` and its test only once Task 8 switches over.
- [ ] Commit: `Add Discord-flavoured markdown with highlighted code blocks`

### Task 3: spoiler marking and replies in the database

**Files:** `supabase/migrations/20261020090000_attachment_spoiler.sql`, `supabase/migrations/20261020090100_message_replies.sql`, `supabase/tests/database/070_spoiler.test.sql`, `supabase/tests/database/071_replies.test.sql`, `src/types/index.ts` (`MediaItem.spoiler`, `Message.reply_to`)

**Replies aren't stored today.** The composer shows a "replying to" bar, but the inserted message carries no reference. The spec's reply strip needs a column.

- [ ] **pgTAP test, written first**, run as Alice/Bea/Cleo against the seed media message:
  - Bea (not the author) can mark Alice's image attachment index 0 as a spoiler.
  - `attachments->0->>'spoiler'` becomes `'true'`.
  - `edited_at` and `content` are unchanged.
  - The `message_media` row for that URL has `spoiler = true`.
  - Unmarking reverses it.
  - Cleo gets `42501`.
  - Index `-1` or index ≥ the array length raises `22023`.
  - A deleted message raises `22023`.
  - `anon` can't execute the RPC.
- [ ] **Migration**, idempotent like the sub-project 2 files:
```sql
-- Sub-project 3a: mark or unmark a posted photo/video/GIF as a spoiler (either member, any message).
alter table public.message_media add column if not exists spoiler boolean not null default false;

create or replace function public.rebuild_message_media(m public.messages)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.message_media where message_id = m.id;
  if m.deleted or m.conversation_id is null or m.space is null then return; end if;

  insert into public.message_media (message_id, conversation_id, space, session_id, kind, url, filename, extension, size, spoiler, created_at)
  select m.id, m.conversation_id, m.space, m.session_id,
         case when a->>'type' in ('image', 'video', 'gif', 'file', 'audio') then a->>'type' else 'file' end,
         a->>'url', a->>'filename', public.file_extension(a->>'filename'),
         case when a->>'size' ~ '^[0-9]+(\.[0-9]+)?$' then (a->>'size')::numeric::bigint end,
         coalesce((a->>'spoiler')::boolean, false),
         m.created_at
    from jsonb_array_elements(case when jsonb_typeof(m.attachments) = 'array' then m.attachments else '[]'::jsonb end) a
   where coalesce(a->>'url', '') <> '';

  insert into public.message_media (message_id, conversation_id, space, session_id, kind, url, filename, created_at)
  select m.id, m.conversation_id, m.space, m.session_id, 'link', u.url,
         lower(substring(u.url from '^[A-Za-z]+://([^/:?#]+)')), m.created_at
    from (select distinct regexp_replace(x[1], '[.,!?;:]+$', '') as url
            from regexp_matches(coalesce(m.content, ''), '(https?://[^\s<>"'')\]]+)', 'gi') as x) u;
end $$;
revoke execute on function public.rebuild_message_media(public.messages) from public, anon, authenticated;

-- Backfill the new column for existing rows.
do $$
declare m public.messages;
begin
  for m in select * from public.messages loop perform public.rebuild_message_media(m); end loop;
end $$;

create or replace function public.set_attachment_spoiler(p_message uuid, p_index integer, p_spoiler boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_conv uuid;
  v_deleted boolean;
  v_len integer;
begin
  select m.conversation_id, m.deleted, jsonb_array_length(case when jsonb_typeof(m.attachments) = 'array' then m.attachments else '[]'::jsonb end)
    into v_conv, v_deleted, v_len
    from public.messages m where m.id = p_message;
  if v_conv is null then raise exception 'message not found' using errcode = '22023'; end if;
  perform public.require_member(v_conv);
  if v_deleted then raise exception 'message is deleted' using errcode = '22023'; end if;
  if p_index is null or p_index < 0 or p_index >= v_len then raise exception 'no attachment at index %', p_index using errcode = '22023'; end if;
  if p_spoiler is null then raise exception 'p_spoiler is required' using errcode = '22023'; end if;
  update public.messages
     set attachments = jsonb_set(attachments, array[p_index::text, 'spoiler'], to_jsonb(p_spoiler), true)
   where id = p_message;
  -- messages_sync_media (after update of attachments) rebuilds the media rows, carrying the flag.
end $$;
revoke execute on function public.set_attachment_spoiler(uuid, integer, boolean) from public, anon;
grant execute on function public.set_attachment_spoiler(uuid, integer, boolean) to authenticated;
```
  - **The backfill rewrites media row IDs.** That's acceptable before release, because no client caches a paging cursor across a deploy. Note this in the migration comment.
  - **`test:migration`** must stay green. Its assertions don't depend on media row IDs; if one does, adapt it.
- [ ] **Replies migration** (test first, in `071_replies.test.sql`):
  - A reply to a message in the same conversation is stored.
  - A reply pointing at another conversation's message is rejected (`23514`).
  - Deleting the original (hard delete) sets `reply_to` to null. Soft deletes keep it, and the UI shows "Original message deleted".
```sql
-- Sub-project 3a: persist which message a message replies to (same conversation only).
alter table public.messages add column if not exists reply_to uuid references public.messages(id) on delete set null;
create index if not exists messages_reply_to_idx on public.messages (reply_to) where reply_to is not null;

create or replace function public.messages_reply_check() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.reply_to is not null and not exists (
       select 1 from public.messages o where o.id = new.reply_to and o.conversation_id = new.conversation_id) then
    raise exception 'a reply must point at a message in the same conversation' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists messages_reply_check on public.messages;
-- Runs after messages_compat has filled conversation_id (trigger names fire alphabetically: compat < reply).
create trigger messages_reply_check before insert or update of reply_to on public.messages
  for each row execute function public.messages_reply_check();
```
  The app sends `reply_to` from the composer (Task 11), and `ReplyStrip` (Task 8) looks the original up in the loaded messages, or fetches it once if it isn't loaded.
- [ ] Run `npm run db:reset && npm run test:db && npm run test:migration`.
- [ ] Commit: `Let either member mark posted media as a spoiler; store reply links`

### Task 4: pure chat logic

**Files:** `src/lib/chat/runs.ts`, `dates.ts`, `ticks.ts`, `divider.ts`, with a test file for each.

- [ ] **`groupRuns(messages, { gapMs = 5 * 60_000 })`.** Returns `{ message, runStart: boolean, runEnd: boolean }[]`.
  - A new run starts when the author changes, when more than 5 minutes pass, when the day changes, or around a system message.
- [ ] **`dateChipLabel(date, now, locale)`.** Returns `TODAY`, `YESTERDAY`, the weekday name (within 6 days), or the short date (with the year if it differs).
  - `insertDateChips(rows)` interleaves chips wherever the local day changes.
- [ ] **`tickState`:**
```ts
export type Tick = 'sending' | 'sent' | 'read' | 'failed'
export function tickState(m: { created_at: string; localState?: 'sending' | 'failed' }, partnerReadAt: string | null): Tick
// localState wins; else read when partnerReadAt >= created_at (parsed times); else sent.
```
  `partnerReadAt` is null when receipts are off, because the database rule (RLS) hides the row, so the result stays at `sent`.
- [ ] **`firstUnreadIndex(messages, myReadAt, myId)`.** The index of the first message newer than `myReadAt` that isn't mine; −1 if there is none.
- [ ] **Tests, written first.** Include edge cases: identical timestamps, midnight boundaries in the local timezone (use a fixed `TZ` via `vi.setSystemTime` and `Intl` with an explicit `timeZone`), a run broken by a system message, and receipts off.
- [ ] Commit: `Add message-list logic: runs, date chips, ticks, first unread`

### Task 5: presence across devices

**Files:** `src/lib/presence.ts` (+ test), `src/stores/presenceStore.ts`, `src/hooks/usePresence.ts`, `src/stores/presenceStore.test.ts` (new)

- [ ] **`src/lib/presence.ts`, tests first:**
```ts
export type Presence = 'online' | 'away' | 'offline'
export interface DevicePresence { user_id: string; device_id: string; presence: Presence; at: number }
export function deviceId(): string // random UUID stored in localStorage 'deviceId' (try/catch → per-session fallback)
/** Most-online across a user's devices; lastSeen = latest `at`. */
export function aggregate(devices: DevicePresence[]): Record<string, { presence: Presence; lastSeen: number }>
/** Manual choice from profiles.status wins: 'away' → away, 'offline' (Invisible) → offline; otherwise the aggregate. */
export function displayed(agg: { presence: Presence } | undefined, profileStatus: string | null): Presence
```
- [ ] **`presenceStore`.**
  - The presence key becomes `${userId}:${deviceId()}`, and the track payload is `{ user_id, device_id, presence, at }`.
  - Sync builds `devices[]`, then `aggregate`.
  - Expose `presenceOf(userId)` and `lastSeen(userId)`.
  - Drop `custom_status_text` from the payload. The custom status comes from the profile.
- [ ] **`usePresence`.**
  - On hidden: show the privacy screen and arm Eep (unchanged). Then track **this device** as `offline`, which no longer affects the user's other devices.
  - On show: track `online`, or `away` while idle.
  - Manual Away and Invisible are written to `profiles.status` (existing `StatusPicker` save path) and applied through `displayed()` on every client.
  - Keep the `pagehide`/`pageshow` handling exactly as it is.
- [ ] **Unit tests:**
  - Two devices, one offline, gives online.
  - All offline gives offline, with `lastSeen` set to the max.
  - Manual Invisible overrides online.
  - The device ID is stable across calls.
- [ ] Commit: `Track presence per device and show the most-online state`

### Task 6: layout, breakpoint, launch on the FF14 screen

**Files:**
- **Rewrite:** `AppShell.tsx`
- **Create:** `LeftColumn.tsx`, `ConversationList.tsx`, `SlideOver.tsx`
- **Modify:** `uiStore.ts` (+ test), `useMediaQuery` call sites, `App.tsx`
- **Delete:** `Sidebar.tsx`, `MobileNav.tsx`, `MemberList.tsx`, `UserPanel.tsx`
- **e2e:** fixtures, users

Run the e2e suite from this task onwards.

- [ ] **Breakpoint.** `const isDesktop = useMediaQuery('(min-width: 900px) and (hover: hover) and (pointer: fine)')`.
  - Playwright's `webkit-iphone` project has a coarse pointer, so it stays mobile.
  - Add a `chromium-landscape-phone` check inside an existing spec: a context with `viewport: 852×393, hasTouch: true, isMobile: true`. Assert that the mobile layout renders.
- [ ] **Phone launch on the FF14 screen.** Tests first, in `uiStore.test.ts`. The initial state is computed before React renders:
```ts
const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
const hasPin = safeGet(localStorage, 'hasPin') === '1'
eepMode: sessionStorage eepMode === 'true' || (coarse && hasPin),
pinLocked: coarse && hasPin,
```
  - `loadPin` sets `hasPin` to `'1'` or removes it, depending on `lock_pin_length`. `setPin` sets it and `clearPinRemote` removes it.
  - **On logout, remove `hasPin`.** This is the only device-level secret hint, and it's a boolean.
  - Unit-test all four combinations of coarse/fine and hasPin/no PIN.
- [ ] **Phone layout.**
  - The default view is `chat`. The header's back chevron goes to the `list` view, which is `ConversationList` (one row today: avatar, name, last message, time, an unread badge across both spaces) plus a top bar with your avatar (opens Settings for now) and a settings gear.
  - If there's more than one conversation, the default view is `list`.
  - The current `mobileView` logic is replaced.
- [ ] **Desktop layout.** `LeftColumn` (240 px) holds:
  - a me row (avatar, name, presence, gear)
  - a "Search messages" button that opens search in the slide-over
  - `ConversationList`

  Next to it is the chat column. `SlideOver` (360 px, right) hosts the existing `ChannelInfoPanel` content (media, pins, search) restyled to tokens; the 3b gallery redesign replaces it.
- [ ] Remove `MemberList`/`UserPanel`. The partner profile card arrives in Task 7.
- [ ] **e2e.** `openChat`, `openSpace`, `showSpaces`, `openSettings` and `openInfoPanel` are updated for the new layout:
  - Spaces now live in the header tabs (Task 7). In this task, keep the old `SpaceList` mounted inside the chat column temporarily, so the e2e suite stays green, and remove it in Task 7.
  - Fixtures that relied on the members tab or the user panel are updated.
- [ ] **Gate:** full e2e green, plus the new landscape check and a phone-reload-with-PIN check. Bea has PIN `567890`, so reloading Bea on `webkit-iphone` lands on the FF14 heading, while `chromium-desktop` doesn't.
- [ ] Commit: `New layout: chat-first phones, desktop column and panel; phones with a PIN launch disguised`

### Task 7: header and tabs

**Files:** `ChatHeader.tsx`, `SpaceTabs.tsx`, `StatusPill.tsx`, `EepButton.tsx`, `ChatMenu.tsx`, `PartnerCard.tsx`, `ReconnectBar.tsx` (each with a component test). Delete `ChannelHeader.tsx` and `SpaceList.tsx`.

- [ ] **`StatusPill` (pill A).** Props `{ label, color }`. A tinted background `color-mix(in srgb, color 18%, transparent)`, text `color-mix(in srgb, color 65%, var(--fg))`, and a 7 px dot. It is used for the partner's `status_id` definition from `statusStore`.
- [ ] **`ChatHeader`.**
  - Back chevron (phone), avatar with the presence dot (`displayed()`), name.
  - Subline: `typing…` when the partner is typing in the active space; otherwise `online`/`away`/`last seen <time>`, followed by the pill.
  - Then `EepButton`, the media button (desktop only) and `ChatMenu`.
  - Tapping the avatar or name opens `PartnerCard`, a popover on desktop and a sheet on phone: banner, avatar, name, pill, status message.
- [ ] **`EepButton`.** Red: the icon is lucide `TriangleAlert`; on desktop it's a labelled pill. `aria-label="Eep!"`, and clicking calls `useUiStore.getState().setEepMode(true)`.
- [ ] **`ChatMenu`.** A ⋮ button opening a menu (`role="menu"`, keyboard navigable, closes on Esc and on an outside click) with Search messages, Media, files & links, Pinned messages, a divider, and **Drag the Lake** (`--danger`). It replaces the header's "More actions" menu.
- [ ] **`SpaceTabs`.** `role="tablist"` with two `role="tab"` items, `aria-selected`, and arrow-key navigation. The unread dot is `data-unread`. The highlight slides between tabs (120 ms; none under reduced motion). The existing `data-space` attributes stay for e2e.
- [ ] **`ReconnectBar`.** Shown when `realtimeStatus !== 'SUBSCRIBED'` for more than 2 s: "Reconnecting…" under the header.
- [ ] **e2e:**
  - Update `openSpace` to use the tabs.
  - Add to `eep.spec.ts`: "the Eep! button shows the disguise immediately".
  - Add to `messaging.spec.ts`: "the ⋮ menu's Drag the Lake clears both spaces".
- [ ] Commit: `Cozy header: presence, pill A, Eep! button, ⋮ menu, Main|Schist tabs`

### Task 8: message list in the Cozy look

**Files:** `MessageList.tsx`, `MessageRow.tsx`, `Bubble.tsx`, `DateChip.tsx`, `NewDivider.tsx`, `JumpToLatest.tsx`, `TypingBubble.tsx`, `MediaBlock.tsx`, `ReplyStrip.tsx`, `Ticks.tsx` (component tests for `Bubble`, `MediaBlock`, `Ticks` and `JumpToLatest`); `conversationStore.ts` (+ test); `messageStore.ts` (+ test). Delete the old `MessageList`, `MessageItem` (once Tasks 9 and 10 have moved its reaction and context-menu parts, keep a thin shim until then), `TypingIndicator`, `MarkdownRenderer` and `lib/markdown.ts`.

- [ ] **`conversationStore`.** Add `partnerReadAt: Record<Space, string | null>`. `applyReadPosition` stores the partner's rows: other members' rows only arrive when both people have receipts on, because of RLS. `load` fetches them too. Tests first.
- [ ] **`messageStore` pending and failed messages.** Tests first.
  - `addPending(key, localMessage)` uses a `client_id` (UUID) with `localState: 'sending'`.
  - `confirmPending(key, client_id, serverMessage)` replaces the pending message in place.
  - `failPending(key, client_id)`.
  - Server echoes (realtime) that match the content and author of a pending message within 10 s replace it, so there's no duplicate. A more precise version: send the `client_id` in the broadcast payload, and match on it.
- [ ] **`MessageList`.**
  - Rows come from `insertDateChips(groupRuns(messages))`, and the Task 4 helpers place the `NewDivider` at `firstUnreadIndex`.
  - **Open position.** On opening a space with unread messages, scroll so the divider sits near the top. Otherwise open at the bottom.
  - **Scroll anchoring.** Keep the existing at-bottom auto-scroll behaviour. Keep the bottom anchor when the keyboard opens: listen to `visualViewport` resize, and if the list was at the bottom, re-pin it.
  - **`JumpToLatest`.** Shows when more than one screen from the bottom, with the count of messages newer than the viewport. Tapping it scrolls smoothly.
  - **Mark-read** keeps the sub-project 2 rules.
  - **Typing.** `TypingBubble` renders at the end when the partner is typing in this space. The old text indicator is removed.
- [ ] **`Bubble`.**
  - Cozy styling from the mockup: a tail on `runStart`; mine on the right in `--me`/`--me-fg`, theirs in `--them`.
  - Max width: 78% on phone, 62% on desktop.
  - The time and the "edited" marker sit inside the bubble at the bottom right, floated. `Ticks` (lucide `Clock` / `Check` / `CheckCheck` in `--tick` / `CircleAlert` with Retry) on my messages.
  - The content renders through `Markdown` (Task 2).
- [ ] **`MediaBlock`.**
  - **Images and video:** fitted to the bubble, with the time overlaid on a scrim. Two to four images form a grid, with "+N" beyond four.
  - **Video:** shows a play badge and duration when known.
  - **GIFs:** autoplay muted and loop (stopped under reduced motion).
  - **Files:** a file row.
  - **Spoilers (display):** blurred 24 px and darkened, with a "SPOILER" label. They don't autoplay. A tap reveals the item, with per-viewer local state keyed by `message.id:index` held in component state, so it resets when the message re-renders after its attachments change.
- [ ] **`ReplyStrip`.** Driven by `message.reply_to` (Task 3). Show the original's author and a one-line snippet ("Original message deleted" if it's gone, or "Photo" etc. for media-only messages). Tapping it scrolls to the original and flashes it, loading older pages until it's found, up to 10 pages; otherwise it shows a toast.
- [ ] **System messages** render as centred notes.
- [ ] **Motion.** Newly arrived rows fade and rise 6 px in 160 ms, and my sent bubble springs in. There's no animation on the initial load or on history pages. Everything is off under reduced motion.
- [ ] **Tick integration.** `partnerReadAt[space]` drives the ticks.
- [ ] **e2e** (new spec `e2e/bubbles.spec.ts`):
  - Alice's message shows `data-tick="sent"`, then `"read"` after Bea opens the space.
  - With Bea's receipts off (via `serviceClient`, restored afterwards), it stays `"sent"`.
  - The new-messages divider appears for Bea when she opens a space with unread messages.
  - Jump-to-latest appears after scrolling up and shows the count of new arrivals.
  - A code block renders highlighted, and its Copy button exists.
  - Update existing selectors (`alice.message(text)` etc.) where the markup changed.
- [ ] Commit: `Cozy message list: runs, date chips, ticks, new-messages divider, jump to latest, markdown`

### Task 9: reactions on the conversation channel

**Files:** `src/stores/reactionStore.ts` (+ test), `src/lib/conversationRealtime.ts` (+ test), `src/hooks/useConversationRealtime.ts`, `Reactions.tsx`, `QuickReactBar.tsx` (component tests). Remove the per-message subscription from the old `MessageItem`.

- [ ] **`reactionStore`, tests first:**
```ts
interface ReactionState {
  byMessage: Record<string, Reaction[]>
  idToMessage: Record<string, string>         // for DELETE events that carry only the primary key
  loadFor(messageIds: string[]): Promise<void> // one .in('message_id', ids) query per loaded page
  apply(event: 'INSERT' | 'DELETE', row: Partial<Reaction> & { id: string }): void
  toggle(messageId: string, emoji: string, myId: string): Promise<void> // optimistic, rolls back and returns false on error
  chips(messageId: string, myId: string): { emoji: string; count: number; mine: boolean; userIds: string[] }[] // ordered by first use
}
```
- [ ] **Realtime.** `conversationRealtime` adds `postgres_changes` on `reactions` for INSERT and DELETE, unfiltered. RLS scopes delivery to members, and the table has no `conversation_id` column. The events are routed to `handlers.onReaction`. Unit-test the binding with the fake client.
- [ ] **`messageStore`/`MessageList`.** Call `loadFor` for each page of messages it loads.
- [ ] **`Reactions`.**
  - Chips sit under the bubble, on the bubble's side.
  - Each chip is a button with `aria-pressed={mine}`, emoji (or a custom emoji image) plus a count.
  - Tapping toggles. A long-press or hover shows who reacted ("You, Bea").
  - The add chip (lucide `SmilePlus`) appears when a message already has reactions: always on phone, on hover on desktop.
  - It opens `QuickReactBar` (6 recent emoji stored in localStorage, plus "+" for the existing EmojiPicker).
- [ ] **e2e** (`e2e/reactions.spec.ts`):
  - Alice reacts ❤️, and Bea sees "❤️ 1" live.
  - Bea taps it, giving "❤️ 2" highlighted for Bea.
  - Bea un-taps it, back to 1, live for Alice.
  - Two different emoji make two chips.
  - **Channel count.** After loading the seed messages, `window.supabase` is not exposed, so count the realtime channels instead: expose `window.__realtimeChannelCount = () => supabase.getChannels().length` **only in `import.meta.env.MODE === 'test'`**. Assert it stays ≤ 6 regardless of the message count.
- [ ] Commit: `Discord-style reactions on the conversation channel; no channel per message`

### Task 10: message actions and spoiler marking

**Files:** `MessageActions.tsx` (`ActionSheet` and `HoverToolbar`, with component tests). Delete `MessageContextMenu.tsx`, `ReactionPicker.tsx` and the last of the old `MessageItem`.

- [ ] **Phone (coarse pointer).** A long-press of 400 ms, cancelled if the finger moves more than 8 px, so scrolling isn't hijacked.
  - The bubble lifts (scale 1.02) and the background dims.
  - `QuickReactBar` appears above the bubble, and the action sheet below: Reply · Copy · Edit (mine) · Pin/Unpin · **Mark as spoiler / Remove spoiler** (only when long-pressing a photo, video or GIF; it applies to that index) · Delete (mine; red; confirmation step).
  - Haptics: `navigator.vibrate?.(10)` where available.
- [ ] **Desktop.** A hover toolbar at the bubble's top corner: react · reply · ⋯ (Copy, Edit, Pin, Mark/Remove spoiler on media, Delete). Keyboard shortcuts while hovering or focused: `R` reply, `E` edit (mine).
- [ ] **Spoiler.** Calls `rpc('set_attachment_spoiler', { p_message, p_index, p_spoiler })`.
  - The update is optimistic: set it in `messageStore` and roll back on error with a toast.
  - Other clients update through the existing `messages` UPDATE → `edit` path.
- [ ] **Edit.** Puts the text in the composer with an "Editing message" bar; Esc cancels. Delete keeps today's soft delete.
- [ ] **Swipe to reply.** Leave it out of this task. Record it in the iPhone checklist as a later device experiment, per the spec's escape hatch.
- [ ] **e2e** (`e2e/spoilers.spec.ts`):
  - Bea marks Alice's seed image as a spoiler from the desktop toolbar, and Alice's view shows it blurred live (`data-spoiler="true"`).
  - Alice reveals it locally.
  - Bea removes the spoiler, and it unblurs for both.
  - Long-press on `webkit-iphone` opens the sheet with Reply/Copy/Pin.
  - Restore state in `afterDevicesClose`.
- [ ] Commit: `Message actions on long-press and hover, including marking media as spoilers after posting`

### Task 11: composer

**Files:** `Composer.tsx`, `PendingAttachments.tsx` (component tests). Delete `MessageInput.tsx`.

- [ ] **Layout (mockup).**
  - A rounded field containing the emoji button (left), the textarea (auto-grows to 6 lines, then scrolls), and the GIF and attach buttons (right).
  - The round send button sits outside the field, disabled when the field is empty. The mic is not shown.
- [ ] **The textarea:** `autoCorrect="on" autoCapitalize="sentences" spellCheck enterKeyHint="send" inputMode="text"`.
  - A composition guard: track `isComposing` via `compositionstart`/`compositionend`, and never act on Enter, transform the value, or reset height while composing.
  - The value stays controlled, but nothing rewrites it during input.
  - Height is adjusted in `requestAnimationFrame`.
- [ ] **Enter rule.** Use the desktop query from Task 6.
  - **Desktop:** Enter sends, Shift+Enter adds a newline.
  - **Phone:** Return adds a newline and the button sends. If a hardware keyboard is detected (a `keydown` with `!e.isComposing` and Enter while `matchMedia('(pointer: fine)')` is true), use the desktop rule.
- [ ] **Sending.** `messageStore.addPending`, then the insert, then `confirmPending` or `failPending`. A failed bubble shows a red ! with **Retry**, which re-inserts with the same `client_id`, and Remove.
- [ ] **Keep:** drafts, `/eep`, `/drag`, typing stop, edit mode, GIF picker, uploads.
- [ ] **Reply.** The insert now includes `reply_to: replyTo.id`. Today it's dropped. Add an e2e test: Bea replies to Alice's message, and Alice sees the reply strip with "Alice" and the snippet, live.
- [ ] **`PendingAttachments`.** Removable thumbnails with an upload progress ring (from `uploadFile` progress if available; otherwise an indeterminate spinner) and a **spoiler toggle** (lucide `EyeOff`, `aria-pressed`) that sets `attachment.spoiler`.
  - A failed upload shows Retry and Remove.
- [ ] **e2e:**
  - Alice attaches the stub image, toggles spoiler on and sends. Bea sees it blurred.
  - On `webkit-iphone`, Return in the field adds a newline and doesn't send; the send button sends.
  - On desktop, Enter sends.
  - Typing-indicator specs still pass.
- [ ] **iPhone checklist:** add autocorrect and predictive text working; the keyboard not covering the composer; Return adds a newline.
- [ ] Commit: `Cozy composer: autocorrect-safe input, phone Return rule, spoiler toggle, retry on failure`

### Task 12: end-to-end polish, visual baselines, docs

**Files:** `e2e/themes.spec.ts`, `playwright.config.ts`, `.github/workflows/ci.yml`, `docs/testing/iphone-checklist.md`, `docs/plans/2026-10-18-rework-roadmap.md`, `SETUP.md`

- [ ] **Theme screenshots.**
  - A new `screenshots` project on Chromium with a fixed viewport for desktop 1280×800 and phone 393×852.
  - **Linux only:** `test.skip(process.platform !== 'linux')`, because fonts differ on macOS.
  - For each of the 11 themes, set the theme by writing localStorage before load, then `toHaveScreenshot` of the chat screen. Masks: times, avatars and other dynamic text.
  - CI uses `updateSnapshots: 'missing'` for this project and uploads the `*-snapshots` folders as an artifact on every run, so the first run produces the baselines. The developer downloads and commits them, and later runs compare against them. Document this in SETUP.md.
- [ ] **Presence e2e** (`e2e/presence.spec.ts`): Bea on two devices. One goes to the background (`page.evaluate` dispatching `visibilitychange` hidden on device A), and Alice still sees Bea as online. When both are hidden, Alice sees "last seen".
- [ ] **Repeat runs.** Run every new spec with `--repeat-each=3` on both projects and fix flakiness at its root.
- [ ] **Docs:**
  - **iPhone checklist:** long-press actions; the Eep! button; launching on the FF14 screen with a PIN; spoiler marking; theme status bar colour; landscape stays in the mobile layout.
  - **Roadmap:** 3a built.
  - **SETUP:** screenshot baselines.
- [ ] **Final verification:** `npm run db:reset`, `tsc`, lint, unit, `test:db`, `test:migration`, full `e2e`, `npm run build` and `docker compose build`.
- [ ] Commit: `Theme screenshots, presence e2e, docs for redesign 3a`

## Known open issues and deferrals

- **Swipe-to-reply on phones** is deferred to a device experiment (spec escape hatch).
- **Screenshot baselines** exist only after the first CI run on Linux. Until they're committed, the screenshot project just records them.
- **Settings, login and profile modals** are restyled in 3b. In 3a they follow the theme tokens through the re-pointed utilities, but keep their current layout.
- **Voice memos:** the mic slot is reserved and not shown.

## Final verification

```bash
npm run db:reset
npx tsc -b && npm run lint && npm test
npm run test:db && npm run test:migration
npm run e2e
npm run build && docker compose build
git status   # clean
```
