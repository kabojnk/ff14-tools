# Sub-project 2: Conversations Data Model — Design

**Date:** 2026-10-19
**Status:** Approved in brainstorm (sections 1–3 approved one at a time; the user asked me to continue with my recommendations from section 4 onwards)
**Roadmap:** `2026-10-18-rework-roadmap.md`
**Depends on:** sub-project 1 (test foundation)

## Problem

The data model is shaped like Discord: global channels that every signed-in user can see, a `status` column that mixes automatic presence with custom statuses, a plain-text PIN that every user can read, unread state kept only in each browser, and a media panel that scans the last 300 messages on the client. The Messenger-style rebuild (sub-project 3) needs:

- conversations with members
- the two fixed spaces the user asked for
- a shared read position
- shared coloured statuses
- a server-side media index
- secrets stored securely

Production data is small: 2 users and 51 messages (general 49 messages in 3 sessions, schist 2 messages in 2 sessions, adventures empty).

## Decisions from the brainstorm

| Topic | Decision |
|---|---|
| Structure | One conversation per group of people (usually 2) with exactly **two spaces**, `main` and `schist`. Never more. `general` → Main, `schist` → Schist, `adventures` archived. |
| Statuses | Presence (online/away/offline) is automatic and separate. **Custom statuses** come from a shared list where any member can add, edit or delete a label and colour; it starts with the 4 legacy statuses. Plus a free-text status message with no emoji prefix. The pill design is reviewed in sub-project 3. |
| Read receipts | **A toggle for each person.** Turning it off also hides other people's receipts from you (WhatsApp rules). |
| Media gallery | Photos, Videos, GIFs, Files, Links, Voice (reserved), plus a **custom extension filter**. `.zip`, `zip` and `ZIP` are equivalent. |
| Drag the Lake | Clears **both** spaces. |
| Fill the Lake | Restores every dragged session in both spaces. A **Fill the Lake** button in Settings, gated by one shared lake password (starting value `babystar`, which can be changed in Settings). |
| Rollout | **Expand, then contract.** Add the new schema alongside the old, with compatibility triggers so a cached old app keeps working. Remove the old pieces later in a separate migration. |
| Production | **Nothing goes to production until the whole rework is finished** (user, 2026-10-19). The rehearsal on real data happens immediately before that release. |

Approaches rejected: a one-step rename (a cached iPhone app would fail to send until it refreshes) and keeping the `channels` table with additions (permanent Discord-shaped naming that sub-project 3 would have to build on).

---

## 1. Schema (expand migration)

One new migration file, `supabase/migrations/<ts>_conversations_expand.sql`. It is purely additive: nothing is dropped or renamed. `pgcrypto` (bcrypt via `crypt()`/`gen_salt('bf')`) is already available on Supabase.

### Conversations and members
- `conversations (id uuid pk, title text null, archived bool default false, created_by uuid → profiles, created_at)`. Two-person conversations have no title; the UI shows the other person's name.
- `conversation_members (conversation_id → conversations on delete cascade, user_id → profiles, joined_at, pk (conversation_id, user_id))`.
- Helper: `is_member(conversation_id) returns bool`, `security definer`, `stable`, with `search_path = ''`. It is used by every row-level security (RLS) policy below, which avoids policy recursion.

### Spaces
- The `space` type is `text check (space in ('main','schist'))`. A check constraint was chosen over an enum because it is easier to change in a later migration.
- `messages`: add `conversation_id uuid → conversations` and `space`. Both are nullable during expand; the trigger always fills them. Add the index `(conversation_id, space, created_at desc)`.
- `sessions`: add `conversation_id`. Sessions belong to the **whole conversation**, not to one space, which is what lets a single drag clear both. New messages go into the newest visible session of the conversation. Add the index `(conversation_id, visible, created_at desc)`.
- `pinned_messages`: add `conversation_id`. A pin's space comes from the pinned message.

### Read positions and receipts
- `read_positions (conversation_id, user_id, space, last_read_at timestamptz, pk (conversation_id, user_id, space))`.
- `profiles.read_receipts bool not null default true`.
- RLS for selecting a row: `user_id = auth.uid()`, **or** the caller is a member and both the caller's and the row owner's `read_receipts` are true.

### Statuses
- `status_definitions (id uuid pk, label text not null check length 1–40, color text not null check '^#[0-9a-fA-F]{6}$', position int, legacy_key text unique null, created_by, created_at, updated_at)`.
- Seeded with the four legacy statuses, each with its `legacy_key`. Labels and colours match the current `StatusPicker`:
  - `under_close_watch`: "Under Close Watch", `#ef4444`
  - `found_out`: "Found Out", `#a855f7`
  - `you_can_call`: "You can call me", `#3b82f6`
  - `potential_eep`: "Potential Eep", `#14b8a6`
- `profiles.status_id uuid → status_definitions on delete set null`. `custom_status_text` is reused as the status message. `custom_status_emoji` is no longer read and is dropped in contract.
- Backfill: profiles whose `status` holds a legacy custom value get the matching `status_id`.
- RLS: any authenticated user can select, insert, update or delete.

### Media index
- `message_media (id, message_id → messages on delete cascade, conversation_id, space, session_id, kind text check in ('image','video','gif','file','audio','link'), url, filename null, extension null, size bigint null, created_at)`.
- Index: `(conversation_id, kind, created_at desc)` and `(conversation_id, extension)`.
- The `sync_message_media` trigger runs after insert or update of `content`, `attachments` or `deleted` on `messages`. It deletes the message's rows and rebuilds them:
  - one row per attachment, where `kind` = the attachment type and `extension` = the lowercase filename extension without the dot, or null
  - one row per `https?://` URL found in `content`, with `kind = 'link'`, `filename` = the host
  - no rows if the message is deleted
- Existing messages are backfilled.
- RLS: select if `is_member` **and** the row's session is visible, so Drag the Lake hides media too.

### Secrets
- `profiles.lock_pin_hash text`, `profiles.lock_pin_length smallint check 4–6`. Backfilled from `lock_pin` using bcrypt.
- `private_secrets (key text pk, value_hash text)`. RLS is enabled with **no policies** and grants are revoked from `anon` and `authenticated`, so only security-definer functions can read it.
  - Seeded with `lake_password` = a **precomputed bcrypt hash** of `babystar`. The plain word is never written into the repo.
  - `seed.sql` overrides it locally with the hash of `test-lake-password`.

### Functions (RPCs)
All are `security definer` with `set search_path = ''`. Execute is revoked from `public`/`anon` and granted to `authenticated`. Each one checks `auth.uid()` and membership itself.

| Function | Behaviour |
|---|---|
| `get_messages(p_conversation, p_space, p_limit=50, p_before=null)` | Messages from visible sessions that aren't deleted, newest first. Replaces `get_channel_messages`. |
| `get_media(p_conversation, p_space=null, p_kinds text[]=null, p_extension=null, p_before=null, p_limit=60)` | Gallery query. Null space means both. `p_extension` is normalised (trimmed, leading dots removed, lowercased). |
| `mark_read(p_conversation, p_space, p_at)` | Upserts the read position with `greatest(existing, p_at)`, so it never moves backwards. |
| `set_pin(p_pin)` / `clear_pin()` / `verify_pin(p_pin) → bool` | `set_pin` rejects anything not matching `^[0-9]{4,6}$`. It writes the hash and length and, during expand only, also `lock_pin` so old apps still work. `verify_pin` compares against the caller's own hash only. |
| `drag_the_lake(p_conversation) → uuid` | In one transaction: hides every session of the conversation and inserts a new visible one. |
| `fill_the_lake(p_conversation, p_password) → bool` | False if the password is wrong, with nothing changed. Otherwise sets every session of the conversation visible. |
| `set_lake_password(p_current, p_new) → bool` | False if the current password is wrong. The new password must not be blank. |

### Compatibility (removed in contract)
- `channels` gains `conversation_id` and `space`. The migration maps general → Main, schist → Schist, and adventures stays archived and maps to Main.
- The `messages_compat` before-insert/update trigger:
  - If `conversation_id` is null, it fills `conversation_id` and `space` from `channel_id`.
  - If `channel_id` is null, it fills it from the conversation and space.
  - An unmapped channel goes to Main and raises a `NOTICE`.
- The same trigger logic is applied to `sessions` and `pinned_messages`.
- `change_sheets(channel)` becomes a wrapper around `drag_the_lake(conversation)`.
- `get_channel_messages` keeps its existing behaviour, filtered by `channel_id`.
- `profiles_status_compat` before-update trigger: when an old app writes a legacy `status` value, it sets `status_id` from `legacy_key`. If no row matches, it clears `status_id` and keeps the write valid. When `status` is an automatic value, `status_id` is left alone.
- The plain-text `lock_pin` stays until contract, because old apps compare it locally. `set_pin` keeps both in step.

### Access rules (RLS) change
`messages`, `sessions`, `pinned_messages`, `reactions` (via the message's conversation) and the new tables move from "any authenticated user" to `is_member(conversation_id)`. Insert still requires `auth.uid() = author_id`, and so on. Because `WITH CHECK` is evaluated after BEFORE triggers, old-app inserts that carry only `channel_id` still pass.

### Data migration (inside the same transaction)
1. Create one conversation and add **every existing profile** as a member (production has 2). After this, new sign-ups are **not** added to any conversation automatically (`handle_new_user` is unchanged), so an unexpected account sees nothing.
2. Map the channels, then set `conversation_id` and `space` on every session, message and pin.
3. Backfill the status IDs, PIN hashes and `message_media`.
4. **Count assertions.** Each one raises an exception and rolls back on failure:
   - no message or session left without a `conversation_id`
   - message counts per channel equal message counts per mapped space
   - each user's PIN hash verifies against their `lock_pin`
   - the media row count equals the expected count from attachments plus links
5. Idempotent: every step is guarded (`where conversation_id is null`, `on conflict do nothing`), so a rehearsal can be repeated safely.

### Other fixes
- `alter table reactions replica identity full`.
- Add `conversations`, `conversation_members`, `read_positions`, `status_definitions` and `sessions` to the `supabase_realtime` publication. `sessions` is added so a drag or fill reaches the other screen. A broadcast is also sent as a belt-and-braces measure.

## 2. UI changes in this sub-project

The rule: make the new model work in **today's look**. Anything the user will judge visually is functional but plain and waits for sub-project 3's design review.

**Now:**
- **`channelStore` becomes `conversationStore`.** It loads the user's conversation (there is exactly one today), its members and the active space. The sidebar and the mobile list show two entries, **Main** and **Schist**, and channel creation and renaming are removed.
- **Messages:** loaded with `get_messages` and sent with `conversation_id` and `space`. Realtime topics are `conv:<id>:<space>` for messages and broadcasts, and `typing:<id>:<space>` for typing. The draft key becomes `<conversation>:<space>`.
- **Unread:**
  - The active space calls `mark_read`, debounced, while it is visible, the app is in the foreground and the list is scrolled to the bottom.
  - The other space shows bold or a dot when its newest message is newer than the user's read position.
  - Read positions are loaded at start and kept up to date over realtime, so the state is consistent across devices.
- **PIN:** `uiStore` stops reading `lock_pin`. `loadPin` reads `lock_pin_length`, `PinPad` `verify` calls `verify_pin`, and set, change and remove use `set_pin`/`clear_pin`. The pad's look and behaviour don't change.
- **Drag the Lake:** the trigger is unchanged and it calls `drag_the_lake`. Both screens reload the conversation and keep any unsent drafts.
- **Settings:** a **Fill the Lake** button (password prompt; "Wrong password" on failure), **Change lake password** (current + new), and a **Read receipts** switch.
- **Status picker:** lists the status definitions with simple add, edit and delete (label + colour input). Choosing one sets `status_id`. The emoji prefix is removed.
- **Info panel media tab:** filter chips (All · Photos · Videos · GIFs · Files · Links · Voice), an extension box, a This space / Both toggle, and infinite scroll through `get_media`.

**Later, in sub-project 3, with the user's visual review:** the "Seen" marker (the switch is stored now but nothing displays it), the status pill, the Main | Schist toggle, the gallery and conversation list visuals, and presence per device.

## 3. Failures and edge cases
Approved as presented:
- The migration runs as one transaction, with count assertions that abort it, and it can be re-run.
- PIN verification fails closed when offline ("Couldn't verify. Try again." and the app stays locked).
- Drag and Fill are atomic; a wrong password changes nothing.
- `mark_read` only moves forward.
- Deleting a status clears it for anyone using it and keeps their status message. For concurrent edits, the last write wins. Colours are validated as hex.
- The media index is rebuilt on edit and delete, honours session visibility, and never fetches link URLs.
- An old app's legacy statuses and inserts are mapped. Unmapped writes are cleared or go to Main, so a write never fails.

## 4. Testing

The bug-fix policy from sub-project 1 still applies: a failing test first, at the lowest layer that can reproduce the bug.

### Database tests (new layer): pgTAP via `supabase test db`
`supabase/tests/database/*.test.sql`, run with `npm run test:db` against the local stack. Each file runs in a transaction that is rolled back. Cases are run as users with `set local role authenticated` and `request.jwt.claims`.
- **RLS:**
  - A non-member (a third seeded user, `cleo@test.local`) sees no messages, sessions, media, pins or reactions.
  - Members see only visible sessions.
  - `private_secrets` can't be read by `authenticated`.
  - `lock_pin_hash` comparisons go only through `verify_pin`.
- **Read receipts:** matrix of on/off for both users × own/other row.
- **RPCs:**
  - PIN: `set_pin` validation (3, 7 and non-digit input rejected), `verify_pin` true and false.
  - Lake: drag hides everything and creates exactly one visible session; fill with the wrong password changes nothing; fill with the right password shows everything; `set_lake_password` rules.
  - `mark_read` never goes backwards.
  - `get_media`: kind filters, both-spaces versus one space, extension normalisation (`.ZIP`, `zip`, ` .zip `), hidden sessions excluded.
- **Triggers:**
  - Compatibility both ways: insert with `channel_id` only, and with `conversation_id`/`space` only.
  - Legacy status mapping, including an unknown value.
  - Media index rebuilt on insert, on an edit that removes a link, and on delete.
  - Deleting a status sets `status_id` null.

### Migration test: `npm run test:migration`
Proves that the migration converts **older, multi-channel history**, as the user requested.
1. `supabase db reset --version 20261019080218 --no-seed` resets to the baseline only.
2. Load `supabase/tests/fixtures/legacy-history.sql`, data in the **old shape**:
   - 3 channels plus an extra channel, with hidden and visible sessions across months of history
   - text, GIF, image, video, file (including a `.PMP` extension) and link messages, edited and deleted messages, pins and reactions
   - profiles with legacy statuses and with 4- and 6-digit plain-text PINs
3. Apply the pending migrations (`supabase migration up`).
4. Run `supabase/tests/migration/assert.sql`, which raises on any mismatch: exact per-space counts, session visibility preserved, PIN hashes verify, status mapping, media rows by kind and extension, the extra channel lands in Main.
5. Re-run the expand migration body and assert that nothing changed (idempotency).
6. Finish with `npm run db:reset`, so the normal seed is restored.

### Seed (`supabase/seed.sql`) in the new shape
- Alice and Bea in one conversation with messages in both spaces, a hidden session (so Fill has something to restore), media of each kind, and the four statuses.
- Cleo, who is not a member.
- The lake password `test-lake-password`, plus the compatibility `channels` rows.
- Alice's and Bea's PINs set through the hashing path.
- Fixed UUIDs are kept. `e2e/users.ts` is updated to match.

### Unit (Vitest)
- `normalizeExtension`, the unread calculation (newest message versus read position), and the debounced `mark_read` scheduler.
- The `conversationStore` actions with a mocked client.

### End-to-end (Playwright, two users)
- **Spaces:** a message in Main shows only in Main for the other person; Schist shows unread bold for the other person and clears when opened; read state syncs to `secondDevice`.
- **Lake:** Alice drags and Bea's view clears live in both spaces; Alice fills with the wrong password and then the right one, and Bea sees the history return.
- **PIN:** the existing PIN specs still pass, now through `verify_pin`, and setting a 5-digit PIN works.
- **Statuses:** Bea creates a status, and Alice sees it and can edit its colour.
- **Media:** the Files filter with the extension `pmp`, `.pmp` and `PMP` gives the same result; the Links list shows the host.
- **Old app:** a test inserts a message through supabase-js with `channel_id` only, and it appears live in the correct space for both users.

### CI
Add `npm run test:db` and `npm run test:migration` to the `e2e` job, after `db:start` and before `e2e`. The migration test ends with a reset, so `E2E_SKIP_RESET` stays valid. Also fix the duplicate CI runs on PR branches: trigger `push` on `main` only, plus `pull_request`.

### Release rehearsal (before the eventual production release, not part of this sub-project's build)
Documented in `docs/testing/release-rehearsal.md`:
1. The user runs `pg_dump --data-only` of production in their own terminal, so the password is never shared.
2. Restore it locally on top of the baseline.
3. Apply the migrations.
4. Compare the counts with the pre-release query, then `db push --dry-run`.

## Concerns checklist (defaults; there is no `jig.config.md`)

| Concern | Applies | Notes |
|---|---|---|
| Error handling | Yes | Section 3. The migration aborts on assertion failure; the app fails closed on the PIN. |
| Security | Yes | Membership RLS; bcrypt PIN and lake password; `private_secrets` unreadable from clients; definer functions with an empty `search_path` and execute revoked from anon; plain-text PIN removed in contract. Existing issue noted but out of scope: the Eep passphrase is plain text in `settings` and in git history, already on the roadmap. |
| Test strategy | Yes | Section 4. A new database test layer plus the migration test. |

## Contract migration (later; not built here)
Run once both devices are on the new app, after the production release:
- Drop `channels`, `messages.channel_id`, `sessions.channel_id`, `pinned_messages.channel_id`, `profiles.lock_pin`, `profiles.status` (the custom values), `custom_status_emoji`, `status_definitions.legacy_key`, `change_sheets`, `get_channel_messages` and the compatibility triggers.
- Make `conversation_id` and `space` NOT NULL.

## Out of scope
- Every visual design question (sub-project 3).
- Presence per device (sub-project 3; it is realtime only, with no schema change).
- Voice memo recording. `audio` is only reserved.
- Moving messages between spaces (possible later).
- Rotating the Eep passphrase.
