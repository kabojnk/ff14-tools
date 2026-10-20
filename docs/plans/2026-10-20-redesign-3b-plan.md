# Redesign 3b (You and Your Stuff) Implementation Plan

> **Design:** docs/plans/2026-10-19-redesign-design.md (section 11, plus error handling, testing and the concerns checklist)
> **Mockups (approved):**
> - https://claude.ai/artifact/YW8QxjqbYEkHtAgu7kA42b: profile and status editor (section 2), pill A (section 1), media gallery (section 3)
> - https://claude.ai/artifact/Vr2hVX9q77uhy79DJC5Czu: emoji picker, adding a custom emoji, settings (phone sheet and desktop dialog), photo viewer with "Show in chat"
>
> The token values and the markup structure in those pages are the visual reference. Re-read them with the Artifact tool (`action: "read"`).
>
> **For agents:** use team-dev to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax. Implementers follow the `tdd` skill (red → green → refactor).
>
> **Gate for every task:** `npx tsc -b && npm run lint && npm test` (0 lint errors), then `npm run db:reset && npm run e2e` (full suite, both projects). Any task that touches the database also runs `npm run test:db`.

**Goal:** Finish the redesign's "you and your stuff" half, in the approved Cozy look:
- one profile and status editor (banner, avatar, nickname, status message, Online/Away/Invisible, the shared status list with a swatch palette)
- pill A wherever a custom status shows
- the media gallery grouped by month, with a swipeable full-screen viewer and "Show in chat"
- an emoji picker with Recent, Custom and the standard categories, search, and "Add emoji" (crop, name, upload) with live updates for both people
- Settings as a sheet with sections on phones and a dialog with a left nav on desktop

The FF14 disguise is untouched.

**Architecture.**
- **Shared UI first.** The lead adds three primitives before the parallel tasks start: `Sheet` (a full-height sheet on phones, a centred dialog on desktop), `ImageCrop` (generalised from `BannerCrop`: any aspect ratio, drag plus zoom, canvas export), and `SwatchPalette`. Tasks build on them instead of each inventing a modal.
- **Emoji.**
  - `emojibase-data` (MIT, English `compact.json`, about 1,900 emoji with search tags) is loaded with a dynamic `import()` the first time the picker opens, so it stays out of the main bundle (about 87 KB gzipped).
  - Custom emoji live in `emojiStore` as full rows, kept live through a module-level `postgres_changes` channel. That needs `custom_emoji` in the realtime publication (Task 1).
- **Jump to a message from outside the list.**
  - A small `jumpStore` holds a pending `{ messageId, space }`.
  - `AppShell` switches space if needed. `MessageList` consumes the request with its existing `onJump`, which pages back and flashes the row.
  - The gallery viewer, search results and pinned messages all use it.
- **Replacing the old screens.** `ProfileEditor` replaces `StatusPicker` and the profile part of `UserSettings`. `Settings` replaces `UserSettings`. The new `EmojiPicker` replaces `components/chat/EmojiPicker`. Each task deletes what it replaces, plus the dead `UserProfile`/`UserProfileFull`.

**Tech stack additions.** `emojibase-data` 16.x (data only; npm adds its `emojibase` peer for types). No other runtime dependencies.

**Commit convention:** a short imperative subject, ending with
```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

**Branch:** `feat/redesign-3b`, cut from `feat/redesign` (PR #3). Rebase onto `main` once PR #3 is merged.

**Production safety:** No task touches hosted Supabase or pushes. Task 1's migration is additive. Its name check is `NOT VALID`, so emoji already in production are never re-checked.

## Decisions recorded with the user (2026-10-20)

| Question | Answer |
|---|---|
| Emoji picker, add-emoji flow, settings and viewer look | Approved from the mockup |
| Log out | **In both places:** on the FF14 screen (unchanged) and in Settings (Security & privacy on phones, the bottom of the left nav on desktop) |
| Emoji skin tones | **Left out** of this build. The default yellow only |
| Emoji data | `emojibase-data`, lazy-loaded |
| Custom emoji live updates | Yes. Add the table to the realtime publication |
| Jump from search and pins | Yes, through the same jump mechanism as "Show in chat" |

## Plan review amendments (override the task text below where they conflict)

Four specialist reviewers checked this plan against the code: task dependencies, migration safety, blast radius and state completeness. Their fixes are listed here by task, and implementers must apply them. Where an amendment contradicts a task's text, **the amendment wins**.

**Ownership (all waves)**
- **`AppShell.tsx`:** T8 only. T6 doesn't touch it. The custom emoji feed starts lazily: `emojiStore.load()` (already called by `MessageList` on mount) also calls `subscribe()` the first time. So no new mount point is needed.
- **`e2e/fixtures.ts`:** T7 owns `openSecurity`, `openSettings` and `openProfileEditor`, plus the lake helpers. T4 doesn't edit `fixtures.ts`.
- **`e2e/media.spec.ts`:** T5 and T8 only, in that order. T7 doesn't edit it. The `openSecurity()` call at L99–101 keeps working through T7's helper change.
- **`MediaBlock.tsx`:** T5 owns its `formatDuration` move (add it to T5's files). T8 changes only how it opens the viewer.
- **T9 can start as soon as T6 is merged,** in parallel with T7 and T8. Their files don't overlap.

**T0 `Sheet`**
- **Esc:**
  - One bubble-phase `keydown` listener on `document` that **never** calls `stopPropagation`. `AppShell`'s double-Esc Eep shortcut must keep working with a sheet open; follow the `ChatMenu.tsx:16` precedent.
  - Only the **topmost** open sheet reacts. Keep a module-level stack of open sheets, so a sheet opened over another (AddEmoji over the picker, Settings → PIN wizard) closes alone.
  - Ignore Esc when `event.defaultPrevented` is set, or when the PinPad is open (`document.querySelector('[data-pin-pad]')`; add that attribute to `PinPad`'s root, its only change). Children that handle Esc themselves (an inline status edit) call `preventDefault()`.
- **z-index:** sheets and dialogs `z-50`, the emoji picker `z-50`, the viewer `z-[60]`. `PinPad` stays on top at `z-[70]`. The focus trap skips while `[data-pin-pad]` is present.
- **Layout switch:** don't unmount the children when `useMediaQuery(DESKTOP_QUERY)` flips. Render one tree and change only the container classes, so staged state (ProfileEditor, the Settings section stack, the PIN wizard) survives a rotation or a window resize.
- **Tests:** a nested sheet closes alone on Esc; Esc with `[data-pin-pad]` present does nothing; Esc still reaches a `window` listener; children survive a breakpoint flip.

**T1 migration: idempotent, like the earlier migrations**
- **Constraint:** wrap the constraint add in `do $$ begin if not exists (select 1 from pg_constraint where conrelid = 'public.custom_emoji'::regclass and conname = 'custom_emoji_name_format') then … end if; end $$;`.
- **Policy:** `drop policy if exists "Members add their own custom emoji"` before creating it.
- **Publication:** guard the add with `pg_publication_tables`, as `20261019120000_conversations_schema.sql` L121–124 does.
- **Default adder:** add `alter column uploaded_by set default auth.uid()`, so an insert that leaves the adder out still passes the new policy.
- **Checks:** `npm run test:migration` must pass, since it re-runs every migration. Extend `supabase/migration-test/assert.sql` with the policy and publication membership. pgTAP also checks that the old policy name is gone.
- **Breaking-change note:** this is a deliberate breaking change for anything inserting as someone else. No app version ever had an add-emoji flow.

**T3 profile editor**
- **Status list writes immediately, so Cancel can't undo it.** Show the note "Changes to the status list save straight away" under the list's heading. Cancel discards only the editor's own fields.
- **Creating a status selects it.** Save always writes the **validated** id (the selected id only if it still exists in `definitions`, else null), as `StatusPicker` does.
- **An inline status edit open at Save time** is saved first if valid, otherwise Save is blocked with the row's error.
- **Nickname:** Save is disabled while it's blank, with the hint "Enter a nickname".
- **Banner removal:**
  - "Remove banner" stages `banner_url: null`, and Save writes it.
  - Storage objects aren't deleted. Unused uploads are a known leftover.
- **New uploads get a fresh name each time** (`upload-media` already names files with a UUID), so no cache-busting is needed.
- **Partial failure:**
  - Uploaded URLs are kept in component state, so a retry after a failed profile update doesn't upload again.
  - A failure in `fetchProfile()` or `setOverride` after a successful update still closes the sheet. The next profile event corrects the view.
- **Cancel with unsaved changes** asks "Discard your changes?" (Discard / Keep editing) inside the sheet.
- **Presence choice:** the editor reads the live override when it opens. A change made on another device while the editor is open is overwritten by Save. That's acceptable for two people and is noted in a code comment.

**T4 settings**
- **Don't restyle `LakeSettings.tsx`.** Build new `src/components/settings/LakeRows.tsx` and `ReadReceiptsRow.tsx` (moving the logic and the tests from `LakeSettings.test.tsx`). T7 deletes `LakeSettings` with `UserSettings`.
- **Lake rows:**
  - The rows read **"Fill the Lake"** and **"Change lake password"**, with no ellipsis. Each is a disclosure button (`aria-expanded`).
  - The submit buttons keep their current names. Tell them apart by role and state, not by text. T7 updates `fillTheLake` in the fixtures to expand the row first and then click the submit button inside the expanded region (`getByRole('region', { name: 'Fill the Lake' }).getByRole('button', { name: 'Fill the Lake', exact: true })`).
  - Forms stay expanded after success. The field resets to `''` and "Lake filled." shows, which `lake.spec.ts:70/93` expects.
- **PIN wizard:**
  - Move `pinStep`, `pinSuccess`, `handlePinSuccess` and `finishPinWizard` into `SecuritySection` unchanged, with their `useUiStore` calls (`setPin`, `clearPinRemote`, `verifyPin`, `pinLength`).
  - The section stays mounted while its wizard runs.
  - "PIN changed successfully" shows inside the section.
  - Add a unit test that the success message survives.
- **Log out:**
  - Move `EepMode`'s `handleLogout` (`signOut()`, `clearPin()`, `setEepMode(false)`) into one exported `logOut()` in `src/lib/logout.ts`.
  - Both `EepMode` and Settings call it. `EepMode`'s look and behaviour don't change.
  - Settings asks "Log out of this device?" (Log out / Cancel) first.
- **Navigation:**
  - Esc in a pushed phone section goes Back. Esc at the top closes.
  - Crossing the breakpoint keeps the current section: phone stack top ↔ desktop selection; desktop defaults to Appearance when the stack is empty.
  - "Edit profile" closes Settings and opens ProfileEditor. Focus then goes to the gear button.
  - Closing Settings mid-PIN-wizard closes the PinPad too, and nothing is saved.

**T5 gallery**
- Keep `data-media-item={kind}` on every thumbnail, file row and link row.
- Keep the spoiler marker `data-spoiler`.
- **States:** a skeleton grid on the first load; "Couldn't load media. Retry" when `useMediaGallery` reports `error` (`loadMore` failures show the same line at the bottom with Retry).
- **Video durations:** load only for thumbnails in view (the IntersectionObserver), and one at a time.
- **Infinite scroll:** the sentinel's observer uses the panel's scroll container as `root`.

**T6 emoji store**
- **Sign-out:** `reset()` also removes the channel. `authStore.signOut()` calls `useEmojiStore.getState().reset()`. `jumpStore` resets there too (T8).
- **Reconnects:** `load()` retries on the next call after an error. A `SUBSCRIBED` status after the first one calls `load()` again, to catch up on changes missed while disconnected.
- **Deletes are tracked:** ids deleted locally go into a short-lived set, and a late realtime INSERT for one of them is ignored.
- **Channel budget:** `reactions.spec.ts` asserts six realtime channels or fewer. Check the count with the new channel in place, and raise the cap to 7 with a comment if needed.
- **e2e restore:** move the `restore()` change (delete extra emoji, put the two seeded ones back) into T6.

**T7 wiring**
- **Markers to keep:**
  - The `MeRow` pill keeps `data-status-label` (`StatusPill` has it) and the presence dot keeps `data-presence`.
  - `statuses.spec.ts` reads the pill's colour from `[data-pill-dot]`. Update that selector rather than the component.
- **Helpers:**
  - `openSecurity()` clicks the button or nav item named exactly "Security & privacy", then waits for "App Lock PIN".
  - Rename `openStatusPicker` to `openProfileEditor`.

**T8 jump and viewer**
- **`jumpStore`:**
  - `request` stores `{ messageId, space, at: Date.now() }`.
  - `take` ignores requests older than 10 s.
  - `reset()` is called on sign-out.
  - A repeat request for the same message works, because each call stores a new object.
- **`MessageList`:**
  - Takes the request only once the list is `ready` and `opened` (after the open-position layout effect).
  - Then sets `atBottomRef.current = false` and writes the jump position to `scrollMemory`, so the 400 ms re-pin and the ResizeObserver don't scroll it away.
  - On phones, the "Couldn't find the original message" notice shows in the chat after the panel closes.
- **A space switch caused by a jump** keeps any reply or edit in progress. Only a manual tab change clears them, as today. On desktop the panel stays open, and its pins and search results are re-scoped to the new space (the list follows the space you're in).
- **Viewer:**
  - **Count:** reads "4 of 23" over the **loaded** items. Reaching the last loaded item calls the gallery's `loadMore` when `hasMore`.
  - **Navigation:** no wrap-around; the arrows are disabled at the ends.
  - **Per item:** each item starts with the spoiler hidden, and any playing video pauses on navigation.
  - **Errors:** a failed load shows the "Couldn't load" tile. If the current item disappears (deleted), the viewer moves to the nearest item, or closes if none are left.
  - **Z-order:** it opens above the desktop panel (`z-[60]`).
- **Markers to keep:** the viewer keeps the "Close" and "Show spoiler" names that `media.spec.ts` uses.

**T9 picker**
- **Files:** add `Composer.test.tsx`, `QuickReactBar.test.tsx`, `Reactions.test.tsx` and `MessageActions.test.tsx` to T9's files.
- **Anchoring:** the desktop popover anchors to the trigger's rect (`getBoundingClientRect`), so `QuickReactBar`'s alignment wrapper goes away.
- **Deleted custom emoji:**
  - Recent drops `:name:` entries that aren't in `byName`.
  - Messages and reaction chips show the plain `:name:` text (the existing fallback).
  - Re-adding a name later makes old uses show the new picture. That's accepted and noted in the delete confirmation's text: "Messages that use it will show :name: as text."
- **A row deleted by the other person** while its card or delete confirmation is open closes them.
- **e2e:** add a reaction with a custom emoji (Alice reacts with `:moogle:` and Bea sees the image chip).

**T10 add emoji**
- **The picker stays mounted under the AddEmoji sheet,** in both modes, and receives `onAdded(name)` to scroll to and highlight the new emoji.
- **The name field shows** a taken-name error from the server (23505) and the server's name-rule error (23514).

**Correctness review (a fifth reviewer traced each task through the real code, libraries and iOS behaviour)**
- **T0 emoji data version:**
  - Pin **`emojibase-data@16.0.3`** (Emoji 16). Version 18 carries Emoji 18 glyphs that current iPhones don't have.
  - npm also installs its `emojibase` peer (types only, small); note that in the commit.
  - `data.ts` declares its own `CompactEmoji` shape (`label`, `unicode`, `group?`, `order?`, `tags?`) instead of importing the peer's type.
  - Update the plan header's tech stack to "16.x".
- **T0 version define:** read the version from `package.json` in `vite.config.ts` (`JSON.parse(readFileSync('./package.json', 'utf8')).version`). The Dockerfile runs `vite build` directly, so `npm_package_version` would be empty. Vitest applies the top-level `define`, so drop the `test.define` step.
- **T0 `ImageCrop` decode:**
  - Decode once, through an `HTMLImageElement` (`img.decode()`, which honours EXIF orientation in WebKit and Chromium), and use that one source for the size, the preview and `drawImage`.
  - A decode failure calls `onError('Couldn't open this image.')`, and the caller shows it.
  - The output file is named by type: `avatar.jpg`, `banner.jpg`, `emoji.png`. `upload-media` takes the extension from the name.
  - Tests: the exported name ends in `.png` for emoji; a rejected decode shows the error.
- **T1 seed:** `seed.sql` already sets `uploaded_by` on both emoji, so drop that step. `CustomEmoji.uploaded_by` becomes `string | null` (production rows may be null). T9's card reads "Added <date>" when the adder is unknown, with a test.
- **T5 sender:** `get_media` rows have no author, so the viewer header and the link rows' "who" have nothing to show.
  - `useMediaGallery` batch-fetches `messages.select('id, author_id').in('id', ids)` for each page and sets `MediaItem.author_id` (an optional field on the type).
  - No schema change, so T5 stays in Wave 1.
  - Tests: a link row shows the sender; the viewer header (T8) shows the partner's name for her photo.
- **T5 `useMediaGallery` options:**
  - Add `limit?` and `enabled?` (with tests).
  - The "Without the filter" fallback uses `{ extension: '', limit: 5, enabled: hasExtension && matches < 3 }`, so it never runs without an extension filter.
- **T5 infinite scroll:**
  - Re-check the sentinel's `isIntersecting` whenever `loading` goes false, so a sentinel that stays visible keeps loading.
  - Stub `IntersectionObserver` in the test; jsdom has none.
  - Test: the sentinel stays visible across two loads, and `loadMore` runs twice.
- **T8 jumps to old messages:**
  - The request carries `created_at` (media items, pins and search results all have it).
  - `MessageList` pages back with `fetchOlder` until the oldest loaded message is at or before that time, or there's no more history. A safety cap of 200 pages replaces `MAX_REPLY_PAGES` for these jumps.
  - Jumps from outside a reply use their own notice: "Couldn't find that message. It may have been deleted."
  - Test: in a unit test with a mocked store, a jump to a message three pages back calls `fetchOlder` three times and flashes it.
- **T9 QuickReactBar:**
  - While the full picker is open, the bar pauses its outside-press and Escape handlers. The picker's portal root counts as inside.
  - Test: open "More emoji", click an emoji, `onPick` fires and the reaction is sent.
- **T9 Composer on phones:**
  - Track the caret in a ref (updated on `select`, `keyup` and `blur`, and moved past each insert), and insert **without focusing** the textarea while the picker is open on a phone, so the keyboard stays down.
  - The phone panel sits in the layout **below the composer** (it pushes the composer up, like the keyboard does) instead of over it, so you can see what you inserted.
  - Test: "ab|cd", then 😀 twice, gives "ab😀😀|cd".
- **T10 choosing the picture:**
  - The "Add emoji" tile's click handler calls the hidden file input's `click()` synchronously. iOS only opens the photo picker during a user gesture.
  - Step 1 always shows a visible "Choose image" button too, in case the iOS picker was dismissed.
  - Reset `input.value = ''` after reading, so picking the same file again works.
- **T10 size limits:**
  - Still images up to 25 MB, the server's limit (they're cropped to a 128×128 PNG of a few KB).
  - GIFs, which upload as they are, up to 2 MB.
  - Test: a 4 MB JPEG reaches the crop step; a 3 MB GIF is rejected with "GIFs can be up to 2 MB."
- **T11 iPhone checklist additions:** crop a portrait photo (the right way up), add an emoji from a camera photo, and cancel the photo picker once, then try again.

## Task graph

```
T0 (lead): deps, version define, Sheet, ImageCrop, SwatchPalette
 ├─ Wave 1, in parallel: T1 database · T2 emoji data · T3 profile editor · T4 settings · T5 gallery
 ├─ Wave 2, in parallel: T6 emoji store (T1, T2) · T7 pill everywhere and wiring (T3, T4) · T8 viewer and jump (T5)
 ├─ Wave 3: T9 emoji picker (T2, T6) → T10 add emoji (T6, T9)
 └─ T11: end-to-end, docs, final checks (all)
```

Wave 1 tasks touch disjoint files. `MeRow`, `AppShell` and `ChatHeader` are each edited by **one** task only: T7 for `MeRow`, T8 for `AppShell` and `ChatHeader`. T3 and T4 build new components and leave the old ones mounted, so the app keeps working until T7 swaps them in.

## File structure

| File | Action | Task | Responsibility |
|---|---|---|---|
| `package.json`, `package-lock.json` | Modify | T0 | Add `emojibase-data` |
| `vite.config.ts`, `src/vite-env.d.ts` | Modify | T0 | `__APP_VERSION__` and `__BUILD_DATE__` defines |
| `src/components/ui/Sheet.tsx` (+ test) | Create | T0 | Phone sheet or desktop dialog, focus trap, Esc, header with Cancel/Back/title/action |
| `src/components/ui/ImageCrop.tsx` (+ test) | Create | T0 | Crop at any ratio, drag and zoom, export to a `File` |
| `src/components/ui/SwatchPalette.tsx` (+ test) | Create | T0 | 11 preset colours plus a custom colour input |
| `src/lib/swatches.ts` | Create | T0 | `STATUS_SWATCHES` (the 11 mockup colours) |
| `supabase/migrations/20261020120000_custom_emoji_live.sql` | Create | T1 | Name check (NOT VALID), insert policy tightened, realtime publication |
| `supabase/tests/database/080_custom_emoji.test.sql` | Create | T1 | pgTAP for the above |
| `supabase/seed.sql` | Modify | T1 | Seed `uploaded_by` on both emoji |
| `src/lib/emoji/data.ts` (+ test) | Create | T2 | Lazy dataset, tabs, search |
| `src/lib/emoji/names.ts` (+ test) | Create | T2 | Name normalising and validation |
| `src/lib/recentEmoji.ts` (+ test) | Modify | T2 | Keep 24; `recentEmoji(n)` |
| `src/components/user/ProfileEditor.tsx` (+ test) | Create | T3 | The approved profile and status sheet |
| `src/components/user/StatusList.tsx` (+ test) | Create | T3 | Shared status list with inline edit and swatches |
| `src/components/settings/Settings.tsx` (+ test) | Create | T4 | Sections, phone navigation, desktop left nav |
| `src/components/settings/{AppearanceSection,SecuritySection,NotificationsSection,AboutSection}.tsx` (+ tests) | Create | T4 | Section contents |
| `src/components/settings/ThemeGrid.tsx` (+ test) | Create | T4 | Theme previews (replaces `ThemePicker`) |
| `src/components/user/LakeSettings.tsx` | Modify | T4 | Restyled as grouped rows |
| `src/components/gallery/MediaGallery.tsx` (+ test) | Create | T5 | Filters, month groups, thumbnails, file and link rows |
| `src/lib/gallery.ts` (+ test) | Create | T5 | Month grouping, link labels, duration formatting |
| `src/components/chat/ChannelInfoPanel.tsx` | Modify | T5, T8 | T5 swaps in `MediaGallery`; T8 makes pins and search results jump |
| `src/stores/emojiStore.ts` (+ test) | Modify | T6 | Rows, add, remove, realtime |
| `src/components/layout/MeRow.tsx`, `ConversationList.tsx`, `src/components/chat2/PartnerCard.tsx` | Modify | T7 | Pill A, open `ProfileEditor` and `Settings` |
| `src/components/user/{StatusPicker,UserSettings,UserProfile,UserProfileFull,CustomStatus,ThemePicker,AvatarUpload,BannerCrop}.tsx` | Delete | T7 | Replaced (and their tests) |
| `src/stores/jumpStore.ts` (+ test) | Create | T8 | Pending jump requests |
| `src/components/gallery/MediaViewer.tsx` (+ test) | Create | T8 | Swipeable viewer with "Show in chat" (replaces `chat/MediaViewer`) |
| `src/components/layout/AppShell.tsx`, `src/components/chat2/MessageList.tsx`, `MediaBlock.tsx` | Modify | T8 | Jump plumbing; the chat uses the new viewer |
| `src/components/emoji/EmojiPicker.tsx` (+ test) | Create | T9 | The picker (replaces `chat/EmojiPicker`) |
| `src/components/chat2/{Composer,QuickReactBar,Reactions,MessageActions}.tsx` | Modify | T9 | Use the new picker; insert at the cursor; record recents |
| `src/components/emoji/AddEmoji.tsx` (+ test) | Create | T10 | Choose, crop, name, upload |
| `e2e/*.spec.ts`, `e2e/fixtures.ts`, `e2e/supabase.ts` | Modify | each task, T11 | Specs follow the new UI; restore custom emoji |
| `docs/testing/iphone-checklist.md`, `docs/plans/2026-10-18-rework-roadmap.md` | Modify | T11 | Device checks; 3b marked built |

---

### Task 0 (lead, before the parallel tasks): shared pieces

**Files:** see the T0 rows above.

- [ ] **Dependency.** `npm install emojibase-data@16.0.3` in one commit, so no parallel task touches the lockfile.
- [ ] **Version.** In `vite.config.ts`:
  ```ts
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  ```
  Declare both in `src/vite-env.d.ts` (`declare const __APP_VERSION__: string`) and in `vitest` (`test.define` or a setup file), so components that read them pass in unit tests.
- [ ] **`Sheet`, tests first.**
  ```tsx
  interface SheetProps {
    /** The heading; also the dialog's accessible name. */
    title: string
    onClose: () => void
    /** Left of the title: 'cancel' (text button "Cancel") or 'back' (icon button "Back"). Default 'cancel'. */
    leading?: 'cancel' | 'back' | 'none'
    onLeading?: () => void
    /** Right of the title, e.g. { label: 'Save', onClick, disabled }. Bold accent text. */
    action?: { label: string; onClick: () => void; disabled?: boolean }
    /** Desktop width in px (default 440). */
    width?: number
    children: React.ReactNode
  }
  export function Sheet(props: SheetProps): JSX.Element
  ```
  - Phone layout (`!useMediaQuery(DESKTOP_QUERY)`): full height, `sheet-up` motion, the header grid from the mockup (`1fr auto 1fr`). Desktop: a centred dialog over a dim backdrop, `max-h-[90vh]`.
  - `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing at the heading. Focus moves into it on open and back to the opener on close. Tab is trapped. Esc calls `onClose`. A backdrop click closes on desktop only.
  - Rendered through `Portal`. Colours only through tokens (`--bar`, `--line`, `--wall`, `--accent`).
  - Tests: renders the title as a heading; Esc closes; action button disabled state; 'back' renders a button named "Back"; focus returns to the opener.
- [ ] **`ImageCrop`, tests first.** Generalise `BannerCrop`:
  ```tsx
  interface ImageCropProps {
    file: File
    /** Width ÷ height of the crop frame: 1 for avatars and emoji, 4 for banners. */
    aspect: number
    /** Exported size in px. */
    output: { width: number; height: number }
    /** 'image/png' for emoji (keeps transparency), 'image/jpeg' for photos. */
    type: 'image/png' | 'image/jpeg'
    /** Optional previews drawn under the frame, e.g. [16, 22, 44] for emoji. */
    previews?: number[]
    onCancel: () => void
    onDone: (cropped: File) => void
  }
  ```
  - Drag with pointer capture and `touch-action: none`. Zoom 1×–4× with a range input labelled "Zoom", plus wheel on desktop. The image always covers the frame, so offsets are clamped after every drag and zoom.
  - The crop maths is a pure exported function, `cropRect(natural: {w,h}, frame: {w,h}, zoom: number, offset: {x,y})` → `{ sx, sy, sw, sh }`, and is unit-tested (centred at zoom 1, clamping at the edges, zoom 2 halves the source size).
  - Export draws to a canvas at `output`, then `toBlob(type, 0.9)` → `new File([blob], name, { type })`.
  - Animated GIFs are not cropped. The caller checks `file.type === 'image/gif'` and skips this component (T10).
- [ ] **`SwatchPalette`.** `STATUS_SWATCHES` = the 11 mockup colours in order: `#ef4444 #f97316 #f5a524 #22c55e #14b8a6 #3b82f6 #6366f1 #a855f7 #ec4899 #f472b6 #94a3b8`.
  - `SwatchPalette({ value, onChange })` is a `radiogroup` labelled "Colour". Each swatch is a `radio` named by its hex. The last item is a custom colour `<input type="color" aria-label="Custom colour">` behind a dashed "＋" circle. The selected swatch gets the double ring from the mockup.
  - Tests: picking a swatch calls `onChange` with its hex; a value that isn't a preset marks the custom circle as selected.
- [ ] Commit: `Add Sheet, ImageCrop, SwatchPalette and the emoji dataset for redesign 3b`

### Task 1: custom emoji in the database

**Files:** `supabase/migrations/20261020120000_custom_emoji_live.sql`, `supabase/tests/database/080_custom_emoji.test.sql`, `supabase/seed.sql`

- [ ] **pgTAP first** (`080_custom_emoji.test.sql`), as Alice:
  - Inserting `moogle_wave` with `uploaded_by` = Alice succeeds.
  - Inserting with `uploaded_by` = Bea fails (42501).
  - Inserting `Moogle` or `a` or a 33-character name fails (23514).
  - A duplicate name fails (23505).
  - Bea can delete Alice's emoji (spec: any member can delete).
  - `custom_emoji` is in `pg_publication_tables` for `supabase_realtime`.
- [ ] **Migration:**
  ```sql
  -- New names only: production rows are never re-checked.
  alter table public.custom_emoji
    add constraint custom_emoji_name_format check (name ~ '^[a-z0-9_]{2,32}$') not valid;

  -- The adder is always the signed-in user. No client inserts today (the old app had no add flow).
  drop policy if exists "Authenticated users can upload custom emoji" on public.custom_emoji;
  create policy "Members add their own custom emoji" on public.custom_emoji
    for insert to authenticated with check (uploaded_by = (select auth.uid()));

  alter publication supabase_realtime add table public.custom_emoji;
  ```
  The existing insert policy is "Authenticated users can upload custom emoji" (`20261019080218_remote_schema.sql` L278). Keep the select and delete policies unchanged.
- [ ] **Seed:** set `uploaded_by` on `moogle` and `chocobo` (Bea and Alice), so the picker's "Added by" line has data.
- [ ] Run `npm run db:reset && npm run test:db` and `npm run test:migration`; both pass.
- [ ] Commit: `Custom emoji: name format for new names, adder is the signed-in user, live updates`

### Task 2: emoji data, names and recents

**Files:** `src/lib/emoji/data.ts`, `src/lib/emoji/names.ts`, `src/lib/recentEmoji.ts` (+ tests)

- [ ] **`names.ts`, tests first:**
  ```ts
  /** As the user types: lowercases, turns spaces and dashes into _, drops anything else outside a-z0-9_, max 32. */
  export function normaliseEmojiName(input: string): string
  /** null when valid; otherwise the message to show. */
  export function emojiNameError(name: string, taken: ReadonlySet<string>): string | null
  // 'Use at least 2 characters.' | 'Use lowercase letters, numbers and _ only.' | `:${name}: is already taken.`
  ```
  Normalising also strips surrounding colons, so pasting `:Moogle Wave:` gives `moogle_wave`.
- [ ] **`data.ts`, tests first:**
  ```ts
  export type EmojiTabId = 'recent' | 'custom' | 'smileys' | 'nature' | 'food' | 'activities' | 'travel' | 'objects' | 'symbols' | 'flags'
  export interface StandardEmoji { emoji: string; label: string; tags: string[]; tab: EmojiTabId }
  /** Loads emojibase-data/en/compact.json once (dynamic import), drops the 'component' group and entries without a group, maps groups to tabs, keeps `order`. */
  export function loadEmoji(): Promise<StandardEmoji[]>
  /** Case-insensitive match on label words and tags, prefix first; custom names match too (returned separately). */
  export function searchEmoji(all: StandardEmoji[], custom: { name: string }[], query: string): { standard: StandardEmoji[]; custom: string[] }
  ```
  - The group map: 0 and 1 → `smileys`, 3 → `nature`, 4 → `food`, 5 → `travel`, 6 → `activities`, 7 → `objects`, 8 → `symbols`, 9 → `flags`. Group 2 (components) is dropped.
  - Skin-tone variants aren't in `compact.json`'s top level, so none appear. Keep that, because the user chose no skin tones.
  - Tests mock the import with a handful of entries: tab mapping; components dropped; "cry" finds an emoji tagged `cry` and a custom emoji named `wipe_cry`; an empty query returns nothing; the dataset loads once for two calls.
- [ ] **`recentEmoji.ts`:** keep 24 (`MAX = 24`). `recentEmoji(count = 6)` keeps today's behaviour for the quick bar (topped up with defaults). `recentEmojiList()` returns only real picks, up to 24, for the picker's Recent tab. Custom picks are stored as `:name:`. Update the tests.
- [ ] Commit: `Add the emoji dataset loader, name rules and longer recents`

### Task 3: profile and status editor

**Files:** `src/components/user/ProfileEditor.tsx`, `src/components/user/StatusList.tsx` (+ tests). **Don't** wire it into `MeRow` (T7 does).

- [ ] **`StatusList`, tests first.** Moves the status part of `StatusPicker` into the mockup's list:
  ```tsx
  interface StatusListProps { selectedId: string | null; onSelect: (id: string | null) => void }
  ```
  - Rows: "None", then each definition as a radio row with `StatusPill` and a pencil button titled `Edit <label>`. The last row is "+ New status".
  - Editing opens inline in the row: a label input (`aria-label="Status label"`, max 40, Enter saves, Escape cancels), `SwatchPalette`, a trash button titled `Delete <label>`, and Cancel / Save (`aria-label="Save status"`).
  - Create, update and delete go through `statusStore` straight away, as today (live for both people). Delete asks inside the row ("Delete for everyone?" with Delete / Keep), not `window.confirm`, because confirm dialogs are blocked in some iOS contexts.
  - A definition deleted elsewhere falls back to None (as `StatusPicker` does).
  - Tests: selecting calls `onSelect`; creating with a swatch calls `create({label, color})`; validation errors from `validateStatus` show under the row; deleting needs the confirm step.
- [ ] **`ProfileEditor`, tests first.** `ProfileEditor({ onClose })` inside `Sheet` (title "Profile", leading Cancel, action Save). Top to bottom, as in the mockup:
  1. Banner with a camera button ("Change banner") → file input → `ImageCrop` (aspect 4, 960×240, jpeg) → staged. A "Remove banner" item appears when there is one.
  2. Avatar with a camera button ("Change picture") → `ImageCrop` (aspect 1, 512×512, jpeg) → staged. Avatar uploads are now cropped, which they weren't before.
  3. Nickname (`id="profile-nickname"`, max 32, required; blank keeps the old name).
  4. Status message (`id="status-message"`, max 128, plain text).
  5. "Show me as": a three-segment radio group (Online, Away, Invisible), initial value `displayed({ presence: 'online' }, override)`.
  6. Custom status: `StatusList`.
- [ ] **Save:**
  - Uploads the staged banner (`banners/<uid>`) and avatar (`avatars/<uid>`) through `uploadFile`.
  - Then one `profiles.update({ nickname, custom_status_text, status_id, presence_override: overrideFor(choice), status: choice, avatar_url?, banner_url? })`. `status` stays in step for old cached apps, as `StatusPicker` does today.
  - Then `usePresenceStore.setOverride`, then `fetchProfile()`, then close.
  - **Errors are shown, not swallowed:** an upload or update failure keeps the sheet open with "Couldn't save. Check your connection and try again." and re-enables Save. While saving, Save reads "Saving…" and is disabled.
- [ ] `profile_message` ("About Me") stays editable here as **"About"** (max 190) under the status message. The mockup asked whether to add an "about me" line; the column already exists and the old settings edited it, so keep it rather than drop data from view.
- [ ] Tests (mock `supabase`, `uploadFile`, stores): Save writes the expected columns; Invisible writes `presence_override: 'invisible'` and `status: 'offline'`; a failed update shows the error and keeps the sheet open; Cancel writes nothing.
- [ ] Commit: `Add the profile and status editor sheet`

### Task 4: settings

**Files:** `src/components/settings/*` (+ tests), `src/components/user/LakeSettings.tsx` (+ test). **Don't** wire it into `MeRow` (T7 does).

- [ ] **`Settings({ onClose, onEditProfile })`, tests first.**
  - **Phone:** `Sheet` titled "Settings" (no leading button, action "Done").
    - At the top, a profile card button ("Edit profile": avatar, nickname, `StatusPill` if set) that calls `onEditProfile`.
    - Then one grouped list: Appearance (current theme name), Security & privacy ("PIN on" / "PIN off"), Notifications ("iPhone app"), About (`__APP_VERSION__`).
    - Each row pushes its section screen inside the same sheet: title = section name, leading Back.
  - **Desktop:** a dialog 760×520 with a left nav of buttons: a mini profile line, then Profile (calls `onEditProfile`), Appearance, Security & privacy, Notifications, About, and Log out at the bottom in red. The section shows on the right, with a close button (`aria-label="Close settings"`). It opens on Appearance.
  - Esc closes (fixes the old "ESC" hint that did nothing).
- [ ] **`ThemeGrid`:** each of the 11 themes as a card with a mini chat preview (wallpaper with dots, two bubbles), name and kind (Light / Dark / Pink · Light …).
  - Cards are `radio`s in a `radiogroup` labelled "Theme". Choosing applies `setTheme` at once. The selected card has the accent ring and check.
  - Preview colours come from the theme's own tokens: render each preview with `data-theme={id}`. `themes.css` selects on `[data-theme="<id>"]` alone, so the tokens resolve on any element.
  - Two columns on phones, three on desktop. This replaces `ThemePicker`; move its test cases here.
- [ ] **`SecuritySection`:**
  - **App lock:** "Lock PIN" with the length ("6 digits") or "Off". Then "Set PIN" or "Change PIN" / "Remove PIN". These rows run the existing PIN wizard (`PinStep` flow and `PinPad`, moved unchanged from `UserSettings`, including the "Enter Current Passcode" title).
  - **Privacy:** the read receipts switch, with the sub-line "Off means neither of you sees ✓✓".
  - **The lake:** "Fill the Lake…" and "Change lake password…". Each expands its existing form inline (the `LakeSettings` logic, restyled as grouped rows). Keep the visible texts the e2e tests use ("Lake filled.", the password labels).
  - **Log out** (red, centred row): calls `authStore.signOut()`. Same behaviour as the FF14 screen's Logout.
  - Keep the text "App Lock PIN" visible as the group label, because `openSecurity()` in the e2e tests waits for it, or update the helper in this task.
- [ ] **`NotificationsSection`:** "Notifications come with the iPhone app." Nothing else.
- [ ] **`AboutSection`:** "Version `__APP_VERSION__`", "Built `__BUILD_DATE__`".
- [ ] Tests: the phone row pushes and pops a section; the desktop nav switches sections; the theme grid applies a theme on click; Log out calls `signOut`; the PIN rows show the right buttons for `pinLength` null versus 6.
- [ ] Commit: `Add the redesigned settings: sections on phones, left nav on desktop`

### Task 5: media gallery

**Files:** `src/components/gallery/MediaGallery.tsx`, `src/lib/gallery.ts` (+ tests), `src/components/chat/ChannelInfoPanel.tsx` (the Media tab only), `src/components/chat/MediaFilters.tsx` (restyle)

- [ ] **`gallery.ts`, tests first:**
  ```ts
  /** Items (newest first) into month groups: "October", or "September 2025" outside the current year. */
  export function groupByMonth<T extends { created_at: string }>(items: T[], now: Date): { label: string; items: T[] }[]
  /** A link item's large and small lines: "example.com" and "example.com/guide". Strips "www.", keeps the full address small; the host only when the URL doesn't parse. */
  export function linkLabel(url: string): { site: string; address: string }
  /** 0:42, 1:05, 1:02:03. */
  export function formatDuration(seconds: number): string
  ```
  Move `formatDuration` here from `MediaBlock` and import it there.
- [ ] **`MediaGallery({ conversationId, space, onOpen })`**, on top of `useMediaGallery` (unchanged):
  - **Filters** (restyled `MediaFilters`): chip row, `.ext` box with a leading "." (keep `aria-label="Extension"` and "Clear extension"), and the "This space / Both" segment. Change the placeholder to "extension, e.g. zip" and update `media.spec.ts`.
  - **Visual items:** month headers, then a 3-column grid of square thumbnails.
    - Videos show a play icon bottom-left and their duration bottom-right, read from a `preload="metadata"` `<video>` (none until it loads).
    - GIFs get a "GIF" badge.
    - Spoilers stay blurred with "SPOILER", as today.
    - Thumbnails reuse the chat's loading skeleton and "Couldn't load" tile (the states in `MediaBlock`).
  - **Files** (and Voice): rows with an extension badge icon, name, and "size · Main/Schist · date".
  - **Links:** rows with the link icon, `site` large and `address · who · date` small.
  - **With an extension filter:** a "1 file · .pmp" header over the matches. When there are fewer than 3 matches, a "Without the filter" section shows recent files dimmed, as in the mockup. That's one extra `useMediaGallery` call with no extension, limited to 5.
  - Infinite scroll replaces "Load more": an `IntersectionObserver` sentinel calls `loadMore` when `hasMore`. Keep the empty-state texts the e2e tests use.
  - `onOpen(index, visualItems)` hands the viewer the visual items in gallery order (T8 builds the viewer). Until T8 lands, the panel keeps opening the old `MediaViewer` with the single item.
- [ ] Tests: month headers; GIF badge; the link label; the "Without the filter" section appears below 3 matches; the sentinel calls `loadMore`.
- [ ] Commit: `Media gallery grouped by month, with durations, GIF badges and file and link rows`

### Task 6: custom emoji store

**Files:** `src/stores/emojiStore.ts` (+ test). **Dependencies:** T1, T2.

- [ ] Tests first. The store becomes:
  ```ts
  interface EmojiState {
    /** Every custom emoji, newest first. */
    rows: CustomEmoji[]
    byName: Record<string, string>
    lookup: EmojiLookup // unchanged contract: stable until the set changes
    loaded: boolean
    load: () => Promise<void>
    /** Live inserts and deletes; returns the cleanup. Safe to call twice (one channel). */
    subscribe: () => () => void
    add: (name: string, file: File) => Promise<{ error: string | null }>
    remove: (id: string) => Promise<{ error: string | null }>
    reset: () => void
  }
  ```
  - `load` selects `id, name, image_url, uploaded_by, created_at`.
  - `add` checks `emojiNameError` against `byName`, then calls `uploadFile(file, 'emoji')`, then inserts `{ name, image_url, uploaded_by: myId }`. On a 23505 error it returns `:${name}: is already taken.`; other errors return "Couldn't add the emoji. Try again." The row is added on success without waiting for realtime, and the realtime insert is deduplicated by `id`.
  - `remove` deletes by id, optimistically, and puts the row back if the server refuses.
  - `subscribe` uses one module-level channel, `'custom-emoji'`, with `postgres_changes` INSERT and DELETE on `custom_emoji`. A DELETE payload carries only `old.id`, so remove by id.
  - Mount `subscribe` once next to the status definitions subscription in `AppShell`. Coordinate with T8 (T8 owns `AppShell`): T6 exports the hook `useCustomEmojiLive()` from the store file, and T8 calls it. If T8 has merged first, T6 adds that one line itself.
- [ ] Tests: `add` rejects a taken name before uploading; a 23505 from the insert maps to the taken message; realtime insert and delete update `byName` and change `lookup` identity; a duplicate insert event is ignored.
- [ ] Commit: `Custom emoji store with add, delete and live updates`

### Task 7: pill everywhere, and the new editor and settings wired in

**Files:** `MeRow.tsx`, `ConversationList.tsx`, `PartnerCard.tsx` (+ tests), deletions listed above, e2e (`statuses`, `presence`, `pin-lock`, `lake`, `media` helpers). **Dependencies:** T3, T4.

- [ ] **Pill A everywhere:**
  - `MeRow`: your subline becomes `StatusPill` (if a status is set), then the status message in muted text. Otherwise the presence word, as now.
  - `ConversationList`: the partner's `StatusPill` sits next to the name on the row's top line (as in the mockup's desktop list). It truncates first, before the time.
  - `PartnerCard`: pill, then `custom_status_text`, then `profile_message` (About) when set.
  - `ChatHeader` already shows the pill. Leave it alone, because T8 owns that file.
- [ ] **Wiring:**
  - `MeRow`'s avatar ("Set status") opens `ProfileEditor`.
  - The gear ("User settings") opens `Settings`, whose `onEditProfile` closes Settings and opens `ProfileEditor`.
  - The phone list screen's top bar is `MeRow` too, so both layouts get this.
- [ ] **Delete:** `StatusPicker`, `UserSettings`, `UserProfile`, `UserProfileFull`, `CustomStatus`, `ThemePicker`, `AvatarUpload`, `BannerCrop` and their tests. `grep` for imports first; nothing else may use them. `lib/status.ts` `groupMembers` is unused outside its test, so delete it too.
- [ ] **e2e:**
  - `openStatusPicker()` → `openProfileEditor()`: it expects the heading "Profile".
  - `statuses.spec.ts` follows the new controls ("+ New status", "Status label", the swatch radios replace the "Status colour" input, "Save status", "Status message", "Save").
  - `presence.spec.ts` picks "Away" in the "Show me as" group.
  - `openSecurity()`: `openSettings()`, then the "Security & privacy" row or nav item, then wait for "App Lock PIN".
  - Add a check that the conversation row shows Bea's pill after she sets a status.
- [ ] Commit: `Show pill A everywhere; open the new profile editor and settings`

### Task 8: viewer and "Show in chat"

**Files:** `src/stores/jumpStore.ts`, `src/components/gallery/MediaViewer.tsx` (+ tests), `AppShell.tsx`, `MessageList.tsx`, `MediaBlock.tsx`, `ChannelInfoPanel.tsx` (viewer, pins, search), `ChatHeader.tsx` (only if the panel API changes); delete `components/chat/MediaViewer.tsx`. **Dependency:** T5.

- [ ] **`jumpStore`, tests first:**
  ```ts
  interface JumpState {
    pending: { messageId: string; space: Space } | null
    request: (messageId: string, space: Space) => void
    /** MessageList takes the request for its own space; returns it once, then clears it. */
    take: (space: Space) => { messageId: string } | null
  }
  ```
- [ ] **`AppShell`:** watch `pending`. If `pending.space !== activeSpace`, call `setActiveSpace(pending.space)`. Close the info panel and viewer on phones (desktop keeps the slide-over open, so you can jump through several results). The existing space-change effect closes the panel; change it so that **a space change caused by a jump** keeps the desktop panel open.
- [ ] **`MessageList`:** on mount and whenever `pending` changes, `take(space)`; if there is a request, run the existing `onJump(id)` (pages back up to `MAX_REPLY_PAGES`, scrolls to centre, flashes; shows "Couldn't find the original message" if not found). Because the list remounts per space, a jump that switched space is taken by the new list on mount.
- [ ] **`MediaViewer({ items, index, onClose, onShowInChat? })`, tests first.** Replaces `components/chat/MediaViewer`:
  - Black full screen through `Portal`. Header: the sender's avatar and name, "Main/Schist · date, time", and a close button (`aria-label="Close"`).
  - The item (image, GIF or video with controls) fits the screen. Spoilers start blurred with "Show spoiler", as today.
  - Previous and next arrow buttons ("Previous", "Next") plus horizontal swipe (pointer events, 50 px threshold, `touch-action: pan-y`). Left and Right keys work on desktop. Esc closes.
  - The footer has "4 of 23" and, when `onShowInChat` is given, a "Show in chat" button. The download link stays (desktop only).
  - Tests: arrows and keys move the index; a swipe moves it; "Show in chat" calls back with the current item.
- [ ] **Wire it:**
  - The gallery opens the viewer with its visual items. "Show in chat" calls `jumpStore.request(item.message_id, item.space)` and closes the viewer.
  - `MediaBlock` in the chat opens the viewer with that message's visual attachments (no "Show in chat", since you're already there).
  - **Pins and search results:** each card becomes a button ("Show in chat"), which calls `request(message.id, message.space)`.
- [ ] **e2e** (`media.spec.ts`): open the gallery from Main with "Both", open a Schist photo, "Show in chat" → the Schist tab is selected and the message row has the flash class. Swiping moves to the next photo (phone project).
- [ ] Commit: `Swipeable media viewer with Show in chat; search and pin results jump to the message`

### Task 9: emoji picker

**Files:** `src/components/emoji/EmojiPicker.tsx` (+ test), `Composer.tsx`, `QuickReactBar.tsx`, `Reactions.tsx`, `MessageActions.tsx`; delete `components/chat/EmojiPicker.tsx`. **Dependencies:** T2, T6.

- [ ] **`EmojiPicker({ onPick, onClose, onAddEmoji?, mode })`, tests first.** `mode: 'composer' | 'reaction'` only changes what's recorded as recent (both record).
  - **Phone:** a bottom panel at 54% height with a dim backdrop. **Desktop:** a 352×340 popover anchored above its trigger (the composer's smiley, or the add-reaction chip), flipped below if there's no room.
  - Search box first ("Search emoji", focused on open on desktop only, so the phone keyboard doesn't jump up). Then the tab row: 10 icon tabs with `role="tablist"`, using the mockup's icons, each `aria-label`led (Recent, Custom, Smileys & people, Nature, Food & drink, Activities, Travel & places, Objects, Symbols, Flags).
  - The body is **one scrolling list** of sections. Tapping a tab scrolls to its section, and scrolling updates the active tab. While the dataset loads, show a skeleton grid; if loading fails, show "Couldn't load emoji" with Retry. Recent and Custom work without the dataset.
  - **Search:** results replace the sections, custom matches first ("No emoji match "xyz"" when empty).
  - **Custom section:** an "Add emoji" tile first (only when `onAddEmoji` is given), then every custom emoji. Desktop hover shows the footer card: image, `:name:`, "Added by <nickname> · <date>", and a trash button `aria-label="Delete :name:"`. On a phone, long-press (`useLongPress`) opens the same card as a small menu with "Delete". Delete asks "Delete :name: for both of you?" (Delete / Keep) inside the picker, then `emojiStore.remove`.
  - Grid: 8 columns on phones, 9 on desktop. Each cell is a button named by the emoji's label (or `:name:`).
  - Picking calls `onPick(emoji)`, where custom emoji are `:name:`, then `noteRecentEmoji`. The composer keeps the picker open after a pick (to pick several); reactions close it.
- [ ] **Composer:** insert at the caret, not at the end. Use `selectionStart/End`, restore the caret after the inserted text, and keep the iOS composition guard intact. Pass `onAddEmoji` to open T10's flow; until T10 lands, leave it undefined.
- [ ] **Reactions:** the add-reaction chip and `QuickReactBar`'s "More emoji" open this picker in `reaction` mode. `MessageActions` (phone sheet) uses it too.
- [ ] Tests: tabs scroll to sections (mock `scrollIntoView`); search filters; the custom card's delete needs the confirm step; caret insertion in the composer ("ab|cd" + 😀 → "ab😀|cd").
- [ ] **e2e** (`reactions.spec.ts` and a new `emoji.spec.ts`): Alice reacts with an emoji found through search, and Bea sees the chip. Alice inserts a custom emoji into a message, and Bea sees the image.
- [ ] Commit: `New emoji picker: recent, custom, categories and search; caret insertion`

### Task 10: add a custom emoji

**Files:** `src/components/emoji/AddEmoji.tsx` (+ test), the `Composer`/`Reactions` wiring of `onAddEmoji`, `e2e/emoji.spec.ts`, `e2e/supabase.ts`. **Dependencies:** T6, T9.

- [ ] **`AddEmoji({ onClose, onAdded })`**, a `Sheet` with three steps, as in the mockup:
  1. **Choose:** a file input (`accept="image/png,image/jpeg,image/gif,image/webp"`), opened at once. Files over 2 MB, or of other types, show an error and stay on this step. A GIF skips the crop.
  2. **Crop:** `ImageCrop` (aspect 1, 128×128, `image/png`, previews 16, 22 and 44, labelled "reaction", "in text", "on its own"), with leading Back and action "Next".
  3. **Name:** a large preview, the `:name:` field (`aria-label="Emoji name"`, normalising as you type) with live feedback from `emojiNameError` (":x: is free" in the accent colour, or the error in red), then "Add emoji" (disabled until valid; "Adding…" while it runs).
  - On success: close, call `onAdded(name)`, and the picker scrolls to and briefly highlights the new emoji. Server errors keep the sheet on step 3 with the message.
- [ ] **e2e** (`emoji.spec.ts`, both projects):
  - Alice adds `test_wave` from the picker; the stubbed upload returns the CDN test image. Bea's open picker shows it without a reload (realtime).
  - Bea deletes it after confirming; Alice's picker drops it.
  - A taken name (`moogle`) shows the error.
  - `e2e/supabase.ts`: `restore()` deletes custom emoji other than the seeded two (by name), and puts the seeded two back if a test deleted them.
- [ ] Commit: `Add custom emoji from the picker: crop, name, upload, live for both`

### Task 11: end-to-end polish, docs, final checks

**Dependencies:** all.

- [ ] Run the whole suite three times in a row (first with a reset, then twice with `E2E_SKIP_RESET=1`). Fix any flakiness at the root, the way 3a's Task 12 did (wait for real readiness, restore state even after a failure).
- [ ] Theme screenshots: the chat screen is unchanged by 3b, so the baselines should still match. If T7's pill in the conversation row changes the desktop shot, regenerate the baselines in CI (delete the PNGs, push, commit the artifact, as in `SETUP.md`).
- [ ] `docs/testing/iphone-checklist.md`, new items:
  - **Profile:** crop an avatar and a banner on the device; Save shows the result on the other phone.
  - **Emoji picker:** the panel over the keyboard area doesn't hide the composer; long-pressing a custom emoji offers Delete; adding an emoji from the photo library (including a GIF) works.
  - **Viewer:** swipe between photos; "Show in chat" switches space and highlights.
  - **Settings:** every section opens and Back returns; Log out from Settings lands on the login screen; the FF14 screen's Logout still works.
- [ ] `docs/plans/2026-10-18-rework-roadmap.md`: mark 3b built. `docs/plans/2026-10-19-redesign-design.md` §11: link the second mockup and record the decisions table above.
- [ ] Final gates: `npx tsc -b && npm run lint && npm test`, `npm run db:reset && npm run test:db`, `npm run test:migration`, the e2e runs above, `npm run build`, `docker compose build`.
- [ ] Commit: `Docs and checks for redesign 3b`

## Known open issues and deferrals

- **Skin tones:** left out by the user's choice. `compact.json` keeps them out of the grid.
- **Newest emoji on older iPhones:** Emoji 16 needs iOS 18.4 or later. On an older iOS the handful of Emoji 16 glyphs show as boxes. Updating iOS fixes it.
- **`upload-media`** has no path allowlist and accepts any authenticated caller. The `emoji/` folder works as is. Tightening the function (allowed folders, emoji size cap on the server) belongs with the release hardening, not this build.
- **Voice memos:** the Voice chip stays, with its empty state. Recording stays out of scope.

## Final verification

The lead runs the gates in Task 11 from the main checkout. Then they report the results to the user, together with every decision made without asking (the option chosen, and the alternatives), before offering to push and open the PR.
