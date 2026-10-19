# Conversations Data Model Implementation Plan

> **Design:** docs/plans/2026-10-19-conversations-data-model-design.md
> **Roadmap:** docs/plans/2026-10-18-rework-roadmap.md
> **For agents:** Implement task by task with team-dev (parallel) or sdd (sequential). Steps use checkbox (`- [ ]`) syntax. Implementers follow the `tdd` skill (red → green → refactor). Every task ends green on `npx tsc -b && npm run lint && npm test`, plus the task's own database or e2e command.

**Goal:** Replace global channels with conversations that have members and two fixed spaces (Main, Schist), plus:
- a server-side read position per space
- shared coloured statuses
- a server-side media index with type and extension filters
- hashed, server-checked PIN and lake password
- Drag the Lake across both spaces, and Fill the Lake to restore

Everything is additive (expand). Compatibility triggers keep a cached old app working. No task touches production.

**Architecture:**
- **Database:**
  - Six new migrations: schema → backfill → compatibility → access rules (RLS) → media index → RPCs.
  - Membership is enforced with `is_member()` in every policy.
  - Secrets (PIN hashes, lake password) live in client-unreadable `private_*` tables, reached only through `security definer` RPCs.
  - Read RPCs (`get_messages`, `get_media`) are `security invoker`, so RLS applies.
- **Realtime:**
  - **One private channel per conversation** (`conv:<id>`), authorised by a policy on `realtime.messages`.
  - It carries message, typing and lake broadcasts for both spaces, plus `postgres_changes` on messages, sessions and read positions as a safety net. The safety net also covers inserts from the old app.
  - This replaces the per-channel `channel:<id>` topics and the duplicate `typing:<id>` subscriptions.
- **App:** `channelStore` is replaced by `conversationStore` (conversation, active space, session, read positions, latest message per space). Messages are keyed by `spaceKey = "<conversationId>:<space>"`. The visual design is unchanged apart from the new controls the spec lists.

**Tech Stack:**
- Supabase Postgres 15+: pgcrypto (in the `extensions` schema), pgTAP 1.2 via `supabase test db`, Realtime Authorization.
- supabase-js 2.96, React 18, Zustand 5, Vitest 3, Playwright 1.64.
- Supabase CLI via `npx --yes supabase@2`.

**Commit convention:** short imperative subject; end with
```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

**Production safety:** No task runs `db push`, `--linked` or anything that touches the hosted project. The release rehearsal (Task 18 docs) is user-run and happens only after sub-project 3.

**Deviations from the spec (decided during planning, reported to the user):**
1. **Six migration files instead of one.** Each file is atomic and idempotent. `db push` stops at the first failure, and every earlier file is additive, so a partial push is harmless and re-runnable.
2. **PIN hashes live in `private_pins (user_id, pin_hash)`, not `profiles.lock_pin_hash`.** `profiles` can be selected by every user. Hiding a column would need column privileges, which break every `select('*')`, including the old app's.
3. **`get_messages`/`get_media` are `security invoker`.** RLS does the membership and visibility filtering, so there is no second copy of the rules.
4. **Realtime topics become private, per conversation, rather than per space.** A single subscription is needed for unread updates in the space that isn't open. It also fixes an existing bug: `MessageInput` and `TypingIndicator` both subscribe to `typing:<id>`, and realtime-js shares channels by topic, so one tears the other down.
5. **Only conversation members can change the lake password.** The spec said any signed-in user; a member check stops a stray sign-up.
6. **`mark_read` clamps to `now()`,** so a client clock in the future can't mark later messages as read.
7. **Pins:** fetched per conversation and filtered by space on the client. No new foreign key is needed.
8. **The expand step drops `NOT NULL` on `channel_id`** in messages, sessions and pins, so the new app's inserts never depend on a channel row existing.

---

## File structure

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/20261019120000_conversations_schema.sql` | Create | Tables, columns, indexes, `is_member`, status seed, secrets tables, publication, replica identity |
| `supabase/migrations/20261019120100_conversations_backfill.sql` | Create | One conversation + members, channel → space mapping, re-point rows, status IDs, PIN hashes, assertions |
| `supabase/migrations/20261019120200_conversations_compat.sql` | Create | Old ↔ new triggers on channels, messages, sessions, pins, profile status |
| `supabase/migrations/20261019120300_conversations_rls.sql` | Create | Membership RLS on all chat tables; `realtime.messages` policies |
| `supabase/migrations/20261019120400_message_media.sql` | Create | `message_media`, helpers, sync trigger, backfill, `get_media` |
| `supabase/migrations/20261019120500_conversations_rpcs.sql` | Create | `get_messages`, `mark_read`, PIN, lake RPCs, `change_sheets` wrapper |
| `supabase/seed.sql` | Rewrite | New-shape seed: Alice, Bea, Cleo, conversation, both spaces, hidden session, media, PINs, lake password |
| `supabase/tests/database/*.test.sql` | Create | pgTAP: smoke, RLS, receipts, RPCs, compatibility, media |
| `supabase/tests/fixtures/legacy-history.sql` | Create | Old-shape, multi-channel history for the migration test |
| `supabase/tests/migration/assert.sql` | Create | Post-migration assertions (raise on mismatch) |
| `scripts/test-migration.sh` | Create | baseline → fixture → migrate → assert → re-run → assert → reset |
| `package.json` | Modify | `test:db`, `test:migration` |
| `src/types/index.ts` | Modify | Conversation, Space, StatusDefinition, MediaItem, ReadPosition; message, session and profile fields |
| `src/lib/spaces.ts` (+ test) | Create | `spaceKey`, `SPACE_LABEL`, `isUnread`, `normalizeExtension` |
| `src/lib/readScheduler.ts` (+ test) | Create | Debounced, forward-only `mark_read` scheduler |
| `src/stores/conversationStore.ts` (+ test) | Create | Replaces `channelStore` |
| `src/stores/channelStore.ts`, `src/hooks/useChannels.ts`, `src/components/channels/CreateChannelModal.tsx`, `src/components/channels/ChannelList.tsx` | Delete | Superseded |
| `src/stores/messageStore.ts` | Modify | Keyed by `spaceKey`; `get_messages` |
| `src/stores/typingStore.ts` | Create | Typing users per space |
| `src/lib/conversationRealtime.ts` | Create | Module that owns the `conv:<id>` channel: send helpers and status |
| `src/hooks/useConversationRealtime.ts` | Create | Mounts the channel once (AppShell) |
| `src/hooks/useMessages.ts`, `src/hooks/useTyping.ts`, `src/hooks/usePinnedMessages.ts` | Rewrite | Read from stores and send through the realtime module |
| `src/stores/presenceStore.ts` | Modify | Remove the dead `startTyping`/`subscribeTyping` |
| `src/components/spaces/SpaceList.tsx` | Create | Main/Schist entries with unread state (desktop sidebar and mobile list) |
| `src/components/layout/AppShell.tsx`, `Sidebar.tsx` | Modify | Conversation and space wiring; remove channel creation |
| `src/components/channels/ChannelHeader.tsx` | Modify | Space header; no archive or settings menu |
| `src/components/sheets/SheetsButton.tsx` | Modify | `dragTheLake()` on the conversation |
| `src/components/chat/MessageList.tsx`, `MessageInput.tsx`, `MessageItem.tsx`, `TypingIndicator.tsx`, `ChannelInfoPanel.tsx` | Modify | Props `{ conversationId, space }`; mark-read; media tab via `get_media` |
| `src/stores/uiStore.ts` (+ test) | Modify | PIN via RPCs; `pinCode` removed |
| `src/components/eep/EepMode.tsx`, `src/components/user/UserSettings.tsx` | Modify | `verify_pin`; Lake section; read receipts switch |
| `src/stores/statusStore.ts` (+ test) | Create | Status definitions: load, realtime, CRUD |
| `src/components/user/StatusPicker.tsx` | Rewrite (same look) | Presence choices + shared custom statuses + text-only message |
| `src/lib/status.ts` (+ test) | Create | `presenceOf`, display helpers replacing `statusColor`/`statusLabel` |
| `e2e/users.ts`, `e2e/fixtures.ts` | Modify | New IDs, `openChat(space)`, helpers |
| `e2e/spaces.spec.ts`, `e2e/lake.spec.ts`, `e2e/statuses.spec.ts`, `e2e/media.spec.ts`, `e2e/compat.spec.ts` | Create | Two-user specs |
| `e2e/pin-lock.spec.ts`, `e2e/messaging.spec.ts`, `e2e/eep.spec.ts` | Modify | New openChat; 5-digit PIN set |
| `.github/workflows/ci.yml` | Modify | `test:db`, `test:migration`; push trigger on `main` only |
| `SETUP.md`, `docs/testing/release-rehearsal.md`, roadmap | Modify / Create | Commands, rehearsal, status |

## Task graph

```
DB track:   T1 ─ T2 ─ T3 ─ T4 ─ T5 ─ T6 ─ T7 ─ T8(seed)
App track:               T9 ─ T10 ─ T11 ─ T12 ─┬─ T13 (PIN)
                                               ├─ T14 (Lake + receipts)
                                               ├─ T15 (statuses)
                                               └─ T16 (media)
                                                      ↓
                                     T17 (e2e, after T8 + T13–16) ─ T18 (CI + docs)
```
T9–T11 (types, pure helpers, stores with mocked clients) can start once T3 has fixed the column names. T12 onwards needs T8's seed to run the app locally. T13–T16 touch separate files and can run in parallel worktrees. Each one rebases onto the latest branch before its commit.

---

### Task 1: pgTAP harness

**Files:** `package.json`, `supabase/tests/database/000_smoke.test.sql`, `supabase/seed.sql` (add Cleo only)

- [ ] Add the script `"test:db": "npx --yes supabase@2 test db"`.
- [ ] Add Cleo to `seed.sql`, copying the Alice/Bea pattern: `cccc1111-…` is already used for messages, so use ID `33333333-3333-4333-8333-333333333333`, `cleo@test.local` / `password123`, nickname "Cleo", no PIN.
- [ ] Write `000_smoke.test.sql`. It proves that pgTAP works **while impersonating `authenticated`**, which every later test depends on:
```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

select has_table('public', 'messages', 'baseline schema is loaded');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is(auth.uid(), '11111111-1111-4111-8111-111111111111'::uuid, 'auth.uid() follows the jwt claims');
select ok((select count(*) from public.profiles) >= 3, 'authenticated can read profiles');
reset role;

select * from finish();
rollback;
```
- [ ] `npm run db:reset && npm run test:db` passes all three tests.
  - **If pgTAP fails with `permission denied` on its temp tables after `set local role authenticated`:** capture each value under the role and assert after `reset role`. For example, run `create temp table _got as select count(*) n from public.profiles;` as `authenticated`, then `reset role` and call `select is((select n from _got), …)`. Grant on that temp table if needed. Record whichever pattern works in a comment at the top of `000_smoke.test.sql`; every later database test copies it.
- [ ] Commit: `Add pgTAP database test harness`

### Task 2: migration test harness (red)

**Files:** `scripts/test-migration.sh`, `supabase/tests/fixtures/legacy-history.sql`, `supabase/tests/migration/assert.sql`, `package.json`

- [ ] `scripts/test-migration.sh` (`chmod +x`):
```bash
#!/usr/bin/env bash
# Proves the conversations migrations convert older, multi-channel history correctly.
# Resets the LOCAL database only. Ends by restoring the normal seed.
set -euo pipefail
cd "$(dirname "$0")/.."

BASELINE=20261019080218
DB_CONTAINER=supabase_db_ff14-tools
sb() { npx --yes supabase@2 "$@"; }
psql_db() { docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q "$@"; }

restore() { echo "→ restoring the normal local database"; sb db reset >/dev/null; }
trap restore EXIT

echo "→ baseline schema only"
sb db reset --version "$BASELINE" --no-seed
echo "→ loading legacy (old-shape) history"
psql_db < supabase/tests/fixtures/legacy-history.sql
echo "→ applying pending migrations"
sb migration up --local
echo "→ asserting"
psql_db < supabase/tests/migration/assert.sql

echo "→ re-running every post-baseline migration (idempotency)"
for f in $(ls supabase/migrations/*.sql | sort); do
  v=$(basename "$f" | cut -d_ -f1)
  if [ "$v" -gt "$BASELINE" ]; then psql_db < "$f"; fi
done
psql_db < supabase/tests/migration/assert.sql
echo "✓ migration test passed"
```
- [ ] Add `"test:migration": "bash scripts/test-migration.sh"`.
- [ ] `legacy-history.sql`: data in the **baseline (old) shape**, with fixed IDs. The `handle_new_user` trigger creates profiles when `auth.users` rows are inserted, so profiles are upserted.
```sql
-- Old-shape history for the migration test. Applied on the BASELINE schema only.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token) values
  ('00000000-0000-0000-0000-000000000000','a0000000-0000-4000-8000-000000000001','authenticated','authenticated',
   'legacy-a@test.local', extensions.crypt('password123', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}','{"nickname":"Legacy A"}', '2026-02-01','2026-02-01','','','','','','','',''),
  ('00000000-0000-0000-0000-000000000000','a0000000-0000-4000-8000-000000000002','authenticated','authenticated',
   'legacy-b@test.local', extensions.crypt('password123', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}','{"nickname":"Legacy B"}', '2026-02-01','2026-02-01','','','','','','','','');

insert into public.profiles (id, nickname, status, lock_pin) values
  ('a0000000-0000-4000-8000-000000000001','Legacy A','found_out','1234'),
  ('a0000000-0000-4000-8000-000000000002','Legacy B','online','987654')
on conflict (id) do update set nickname = excluded.nickname, status = excluded.status, lock_pin = excluded.lock_pin;

insert into public.channels (id, name, position, created_by, created_at) values
  ('c0000000-0000-4000-8000-000000000001','general',   0,'a0000000-0000-4000-8000-000000000001','2026-02-01'),
  ('c0000000-0000-4000-8000-000000000002','schist',    1,'a0000000-0000-4000-8000-000000000001','2026-02-02'),
  ('c0000000-0000-4000-8000-000000000003','adventures',2,'a0000000-0000-4000-8000-000000000002','2026-02-03'),
  ('c0000000-0000-4000-8000-000000000004','old-raids', 3,'a0000000-0000-4000-8000-000000000002','2026-02-04');

-- general: two dragged sessions + the current one; schist: one dragged + current; old-raids: current
insert into public.sessions (id, channel_id, visible, created_by, created_at) values
  ('50000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001',false,'a0000000-0000-4000-8000-000000000001','2026-02-10'),
  ('50000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000001',false,'a0000000-0000-4000-8000-000000000001','2026-05-10'),
  ('50000000-0000-4000-8000-000000000003','c0000000-0000-4000-8000-000000000001',true, 'a0000000-0000-4000-8000-000000000002','2026-09-10'),
  ('50000000-0000-4000-8000-000000000004','c0000000-0000-4000-8000-000000000002',false,'a0000000-0000-4000-8000-000000000001','2026-03-10'),
  ('50000000-0000-4000-8000-000000000005','c0000000-0000-4000-8000-000000000002',true, 'a0000000-0000-4000-8000-000000000001','2026-08-10'),
  ('50000000-0000-4000-8000-000000000006','c0000000-0000-4000-8000-000000000004',true, 'a0000000-0000-4000-8000-000000000002','2026-04-10');

insert into public.messages (id, channel_id, session_id, author_id, content, attachments, type, edited_at, deleted, created_at) values
  -- general / session 1 (hidden): 3 texts
  ('e0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','feb one','[]','text',null,false,'2026-02-11 10:00'),
  ('e0000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000002','feb two','[]','text',null,false,'2026-02-11 10:01'),
  ('e0000000-0000-4000-8000-000000000003','c0000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','feb three','[]','text',null,false,'2026-02-11 10:02'),
  -- general / session 2 (hidden): image + a deleted message with an attachment
  ('e0000000-0000-4000-8000-000000000004','c0000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000002',null,
   '[{"url":"https://cdn.example/m/cat.jpg","type":"image","filename":"cat.jpg","size":1000,"spoiler":false}]','text',null,false,'2026-05-11 09:00'),
  ('e0000000-0000-4000-8000-000000000005','c0000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000001','oops',
   '[{"url":"https://cdn.example/m/secret.png","type":"image","filename":"secret.png","size":10,"spoiler":false}]','text',null,true,'2026-05-11 09:01'),
  -- general / session 3 (visible): links, gif, video, two files, an edited message
  ('e0000000-0000-4000-8000-000000000006','c0000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000001','see https://example.com/a and https://Example.com/b.','[]','text',null,false,'2026-09-11 08:00'),
  ('e0000000-0000-4000-8000-000000000007','c0000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000002',null,
   '[{"url":"https://gifs.example/dance.gif","type":"gif","filename":"dance","size":0,"spoiler":false}]','gif',null,false,'2026-09-11 08:01'),
  ('e0000000-0000-4000-8000-000000000008','c0000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000001',null,
   '[{"url":"https://cdn.example/m/clip.mp4","type":"video","filename":"clip.mp4","size":50000,"spoiler":false}]','text',null,false,'2026-09-11 08:02'),
  ('e0000000-0000-4000-8000-000000000009','c0000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000002','raid plan',
   '[{"url":"https://cdn.example/m/raid.PMP","type":"file","filename":"raid.PMP","size":2048,"spoiler":false}]','text',null,false,'2026-09-11 08:03'),
  ('e0000000-0000-4000-8000-000000000010','c0000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000001',null,
   '[{"url":"https://cdn.example/m/notes.zip","type":"file","filename":"notes.zip","size":4096,"spoiler":false}]','text',null,false,'2026-09-11 08:04'),
  ('e0000000-0000-4000-8000-000000000011','c0000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000002','edited text','[]','text','2026-09-11 08:10',false,'2026-09-11 08:05'),
  -- schist / session 4 (hidden) and 5 (visible, link + image)
  ('e0000000-0000-4000-8000-000000000012','c0000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000004','a0000000-0000-4000-8000-000000000001','old schist','[]','text',null,false,'2026-03-11 12:00'),
  ('e0000000-0000-4000-8000-000000000013','c0000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000005','a0000000-0000-4000-8000-000000000002','look http://test.local/x',
   '[{"url":"https://cdn.example/m/rock.png","type":"image","filename":"rock.png","size":3000,"spoiler":true}]','text',null,false,'2026-08-11 12:00'),
  -- old-raids / session 6 (visible): 2 texts
  ('e0000000-0000-4000-8000-000000000014','c0000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000006','a0000000-0000-4000-8000-000000000002','raid one','[]','text',null,false,'2026-04-11 20:00'),
  ('e0000000-0000-4000-8000-000000000015','c0000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000006','a0000000-0000-4000-8000-000000000001','raid two','[]','text',null,false,'2026-04-11 20:01');

insert into public.pinned_messages (channel_id, message_id, pinned_by) values
  ('c0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000009','a0000000-0000-4000-8000-000000000001'),
  ('c0000000-0000-4000-8000-000000000002','e0000000-0000-4000-8000-000000000013','a0000000-0000-4000-8000-000000000002');

insert into public.reactions (message_id, user_id, emoji) values
  ('e0000000-0000-4000-8000-000000000006','a0000000-0000-4000-8000-000000000002','❤️'),
  ('e0000000-0000-4000-8000-000000000013','a0000000-0000-4000-8000-000000000001',':moogle:');
```
- [ ] `assert.sql`. The expected numbers come from the fixture above:
  - messages: Main 13, Schist 2
  - visible sessions 3 (S3, S5, S6), hidden 3
  - media 9 rows: attachments image×2 (cat.jpg, rock.png; secret.png is excluded because its message is deleted), gif×1, video×1, file×2, plus link×3
```sql
\set ON_ERROR_STOP on
do $$
declare
  v_conv uuid;
  n bigint;
begin
  select count(*) into n from public.conversations;
  if n <> 1 then raise exception 'expected 1 conversation, got %', n; end if;
  select id into v_conv from public.conversations;

  select count(*) into n from public.conversation_members where conversation_id = v_conv;
  if n <> 2 then raise exception 'expected 2 members, got %', n; end if;

  -- channel mapping
  if (select space from public.channels where name = 'general') is distinct from 'main' then raise exception 'general must map to main'; end if;
  if (select space from public.channels where name = 'schist') is distinct from 'schist' then raise exception 'schist must map to schist'; end if;
  if (select space from public.channels where name = 'old-raids') is distinct from 'main' then raise exception 'extra channel must land in main'; end if;
  if not (select archived from public.channels where name = 'adventures') then raise exception 'empty adventures must be archived'; end if;
  if (select archived from public.channels where name = 'old-raids') then raise exception 'old-raids has history and must stay unarchived'; end if;
  if exists (select 1 from public.channels where conversation_id is distinct from v_conv) then raise exception 'every channel must be mapped'; end if;

  -- messages
  if exists (select 1 from public.messages where conversation_id is null or space is null) then raise exception 'unmapped messages remain'; end if;
  select count(*) into n from public.messages where space = 'main';   if n <> 13 then raise exception 'main: expected 13 messages, got %', n; end if;
  select count(*) into n from public.messages where space = 'schist'; if n <> 2  then raise exception 'schist: expected 2 messages, got %', n; end if;

  -- sessions (visibility preserved)
  if exists (select 1 from public.sessions where conversation_id is null) then raise exception 'unmapped sessions remain'; end if;
  select count(*) into n from public.sessions where visible;     if n <> 3 then raise exception 'expected 3 visible sessions, got %', n; end if;
  select count(*) into n from public.sessions where not visible; if n <> 3 then raise exception 'expected 3 hidden sessions, got %', n; end if;

  -- pins, reactions
  select count(*) into n from public.pinned_messages where conversation_id = v_conv; if n <> 2 then raise exception 'expected 2 mapped pins, got %', n; end if;
  select count(*) into n from public.reactions; if n <> 2 then raise exception 'reactions changed: %', n; end if;

  -- PINs
  select count(*) into n from public.private_pins; if n <> 2 then raise exception 'expected 2 pin hashes, got %', n; end if;
  if not exists (select 1 from public.private_pins where user_id = 'a0000000-0000-4000-8000-000000000001' and pin_hash = extensions.crypt('1234', pin_hash)) then raise exception 'A pin hash does not verify'; end if;
  if not exists (select 1 from public.private_pins where user_id = 'a0000000-0000-4000-8000-000000000002' and pin_hash = extensions.crypt('987654', pin_hash)) then raise exception 'B pin hash does not verify'; end if;
  if (select lock_pin_length from public.profiles where id = 'a0000000-0000-4000-8000-000000000001') <> 4 then raise exception 'A pin length'; end if;
  if (select lock_pin_length from public.profiles where id = 'a0000000-0000-4000-8000-000000000002') <> 6 then raise exception 'B pin length'; end if;

  -- statuses
  select count(*) into n from public.status_definitions where legacy_key is not null; if n <> 4 then raise exception 'expected 4 legacy statuses, got %', n; end if;
  if (select status_id from public.profiles where id = 'a0000000-0000-4000-8000-000000000001')
     is distinct from (select id from public.status_definitions where legacy_key = 'found_out') then raise exception 'A should have found_out'; end if;
  if (select status_id from public.profiles where id = 'a0000000-0000-4000-8000-000000000002') is not null then raise exception 'B should have no custom status'; end if;

  -- media index
  select count(*) into n from public.message_media; if n <> 9 then raise exception 'expected 9 media rows, got %', n; end if;
  select count(*) into n from public.message_media where kind = 'image'; if n <> 2 then raise exception 'images: %', n; end if;
  select count(*) into n from public.message_media where kind = 'gif';   if n <> 1 then raise exception 'gifs: %', n; end if;
  select count(*) into n from public.message_media where kind = 'video'; if n <> 1 then raise exception 'videos: %', n; end if;
  select count(*) into n from public.message_media where kind = 'file';  if n <> 2 then raise exception 'files: %', n; end if;
  select count(*) into n from public.message_media where kind = 'link';  if n <> 3 then raise exception 'links: %', n; end if;
  if not exists (select 1 from public.message_media where extension = 'pmp' and filename = 'raid.PMP') then raise exception 'raid.PMP must index as pmp'; end if;
  if exists (select 1 from public.message_media where message_id = 'e0000000-0000-4000-8000-000000000005') then raise exception 'deleted message must have no media'; end if;
  if not exists (select 1 from public.message_media where kind = 'link' and url = 'https://Example.com/b' and filename = 'example.com') then raise exception 'trailing dot must be trimmed; host lowercased'; end if;
end $$;

-- What a member actually sees (RLS + invoker RPCs)
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}';
do $$
declare v_conv uuid := (select id from public.conversations limit 1); n bigint;
begin
  select count(*) into n from public.get_messages(v_conv, 'main', 100);   if n <> 8 then raise exception 'visible main: expected 8, got %', n; end if;
  select count(*) into n from public.get_messages(v_conv, 'schist', 100); if n <> 1 then raise exception 'visible schist: expected 1, got %', n; end if;
  -- cat.jpg sits in a hidden session, so a member sees 8 of the 9 media rows
  select count(*) into n from public.get_media(v_conv);                   if n <> 8 then raise exception 'visible media: expected 8, got %', n; end if;
end $$;
rollback;
```
- [ ] Run `npm run test:migration`. It must **fail** at the first assertion (no `conversations` table). That is the red state.
- [ ] Commit: `Add migration test with legacy multi-channel history (red)`

### Task 3: schema migration

**File:** `supabase/migrations/20261019120000_conversations_schema.sql`. Every statement is re-runnable.

```sql
-- Sub-project 2 (expand): conversations, spaces, read positions, statuses, secrets.
-- Additive only. Old columns stay until the contract migration.

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  title text,
  archived boolean not null default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index if not exists conversation_members_user_idx on public.conversation_members (user_id);

-- Spaces: exactly two per conversation, never more.
alter table public.channels add column if not exists conversation_id uuid references public.conversations(id);
alter table public.channels add column if not exists space text;
alter table public.channels drop constraint if exists channels_space_check;
alter table public.channels add constraint channels_space_check check (space in ('main', 'schist'));

alter table public.messages add column if not exists conversation_id uuid references public.conversations(id) on delete cascade;
alter table public.messages add column if not exists space text;
alter table public.messages drop constraint if exists messages_space_check;
alter table public.messages add constraint messages_space_check check (space in ('main', 'schist'));
alter table public.messages alter column channel_id drop not null;
create index if not exists messages_conv_space_created_idx on public.messages (conversation_id, space, created_at desc);

alter table public.sessions add column if not exists conversation_id uuid references public.conversations(id) on delete cascade;
alter table public.sessions alter column channel_id drop not null;
create index if not exists sessions_conv_visible_created_idx on public.sessions (conversation_id, visible, created_at desc);

alter table public.pinned_messages add column if not exists conversation_id uuid references public.conversations(id) on delete cascade;
alter table public.pinned_messages alter column channel_id drop not null;
create index if not exists pinned_messages_conv_idx on public.pinned_messages (conversation_id);

-- Read positions (one row per person per space)
create table if not exists public.read_positions (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  space text not null check (space in ('main', 'schist')),
  last_read_at timestamptz not null,
  primary key (conversation_id, user_id, space)
);

-- Shared custom statuses
create table if not exists public.status_definitions (
  id uuid primary key default gen_random_uuid(),
  label text not null check (char_length(btrim(label)) between 1 and 40),
  color text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  position integer not null default 0,
  legacy_key text unique,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists status_definitions_updated_at on public.status_definitions;
create trigger status_definitions_updated_at before update on public.status_definitions
  for each row execute function public.handle_updated_at();

insert into public.status_definitions (label, color, position, legacy_key) values
  ('Under Close Watch', '#ef4444', 0, 'under_close_watch'),
  ('Found Out',         '#a855f7', 1, 'found_out'),
  ('You can call me',   '#3b82f6', 2, 'you_can_call'),
  ('Potential Eep',     '#14b8a6', 3, 'potential_eep')
on conflict (legacy_key) do nothing;

alter table public.profiles add column if not exists status_id uuid references public.status_definitions(id) on delete set null;
alter table public.profiles add column if not exists read_receipts boolean not null default true;
alter table public.profiles add column if not exists lock_pin_length smallint;
alter table public.profiles drop constraint if exists profiles_lock_pin_length_check;
alter table public.profiles add constraint profiles_lock_pin_length_check check (lock_pin_length between 4 and 6);

-- Secrets: unreadable by any client role. Only security-definer functions touch these.
create table if not exists public.private_pins (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  pin_hash text not null
);
create table if not exists public.private_secrets (
  key text primary key,
  value_hash text not null
);
alter table public.private_pins enable row level security;
alter table public.private_secrets enable row level security;
revoke all on table public.private_pins from anon, authenticated;
revoke all on table public.private_secrets from anon, authenticated;

-- Lake password: bcrypt of the agreed starting value. The plain word is deliberately not in the repo.
insert into public.private_secrets (key, value_hash)
values ('lake_password', '$2a$10$SgQwNmWG7T6Zt9Bb1TGNSuWQIOWNVEJP4nmJy87KlcaElG.mr18DS')
on conflict (key) do nothing;

alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.read_positions enable row level security;
alter table public.status_definitions enable row level security;

-- Membership check used by every policy. Definer + empty search_path avoids policy recursion and hijacking.
create or replace function public.is_member(p_conversation uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.conversation_members m
    where m.conversation_id = p_conversation and m.user_id = auth.uid()
  )
$$;
revoke execute on function public.is_member(uuid) from public, anon;
grant execute on function public.is_member(uuid) to authenticated;

-- Removing a reaction must carry the row in realtime events.
alter table public.reactions replica identity full;

do $$
declare t text;
begin
  foreach t in array array['conversations', 'conversation_members', 'read_positions', 'status_definitions', 'sessions'] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
```

- [ ] Add a pgTAP file, `010_schema.test.sql`: `has_table` for each new table; `col_not_null`/`col_is_null` for the new columns; `channel_id` columns are nullable; `has_function('public','is_member',array['uuid'])`; as `authenticated`, `select` from `private_pins` and `private_secrets` throws `42501` (`throws_ok`); four legacy status rows exist. Write the file first and watch it fail, then add the migration.
- [ ] `npm run db:reset && npm run test:db` is green. `npm run test:migration` still fails, but **later**, at the conversation count, because there is no backfill yet.
- [ ] Commit: `Add conversations schema (expand)`

### Task 4: backfill migration

**File:** `supabase/migrations/20261019120100_conversations_backfill.sql`

```sql
-- Sub-project 2 (expand): move existing data into the conversation model. Idempotent.
do $$
declare
  v_conv uuid;
  n bigint;
begin
  -- Nothing to migrate on an empty database (fresh local reset: the seed creates its own conversation).
  if not exists (select 1 from public.profiles) then return; end if;

  select id into v_conv from public.conversations order by created_at limit 1;
  if v_conv is null then
    insert into public.conversations (created_by)
    values ((select id from public.profiles order by created_at limit 1))
    returning id into v_conv;
  end if;

  -- Everyone who exists today is in the one conversation. Later sign-ups are not added automatically.
  insert into public.conversation_members (conversation_id, user_id)
  select v_conv, p.id from public.profiles p
  on conflict do nothing;

  -- general → main, schist → schist, anything else → main
  update public.channels
     set conversation_id = v_conv,
         space = case when name = 'schist' then 'schist' else 'main' end
   where conversation_id is null;

  -- Extra channels with no history (e.g. adventures) are archived. Nothing is deleted.
  update public.channels c set archived = true
   where c.name not in ('general', 'schist') and not c.archived
     and not exists (select 1 from public.messages m where m.channel_id = c.id);

  update public.sessions s set conversation_id = c.conversation_id
    from public.channels c where s.channel_id = c.id and s.conversation_id is null;
  update public.messages m set conversation_id = c.conversation_id, space = c.space
    from public.channels c where m.channel_id = c.id and m.conversation_id is null;
  update public.pinned_messages p set conversation_id = c.conversation_id
    from public.channels c where p.channel_id = c.id and p.conversation_id is null;

  -- Legacy custom statuses → shared definitions
  update public.profiles p set status_id = d.id
    from public.status_definitions d
   where d.legacy_key = p.status and p.status_id is null;

  -- PINs: hash into the private table. An invalid legacy PIN aborts loudly rather than silently unlocking someone.
  if exists (select 1 from public.profiles where lock_pin is not null and lock_pin !~ '^[0-9]{4,6}$') then
    raise exception 'backfill: a profile has a lock_pin that is not 4–6 digits; fix it before migrating';
  end if;
  insert into public.private_pins (user_id, pin_hash)
  select id, extensions.crypt(lock_pin, extensions.gen_salt('bf')) from public.profiles
   where lock_pin is not null
  on conflict (user_id) do nothing;
  update public.profiles set lock_pin_length = char_length(lock_pin)
   where lock_pin is not null and lock_pin_length is null;

  -- Assertions: any failure rolls the whole file back.
  select count(*) into n from public.messages where conversation_id is null or space is null;
  if n > 0 then raise exception 'backfill: % messages without a conversation/space', n; end if;
  select count(*) into n from public.sessions where conversation_id is null;
  if n > 0 then raise exception 'backfill: % sessions without a conversation', n; end if;
  select count(*) into n from public.pinned_messages where conversation_id is null;
  if n > 0 then raise exception 'backfill: % pins without a conversation', n; end if;
  select count(*) into n from public.profiles p
   where p.lock_pin is not null
     and not exists (select 1 from public.private_pins pp
                     where pp.user_id = p.id and pp.pin_hash = extensions.crypt(p.lock_pin, pp.pin_hash));
  if n > 0 then raise exception 'backfill: % PIN hashes do not verify', n; end if;
end $$;
```
- [ ] The real-data behaviour of this file is covered by `test:migration`, not pgTAP. On an empty database (local reset) it does nothing, and the seed creates the conversation in Task 8.
- [ ] `npm run test:migration` now fails only at the **media** assertions, because `message_media` doesn't exist yet. Every earlier block passes.
- [ ] Commit: `Backfill conversations, spaces, statuses and PIN hashes`

### Task 5: compatibility triggers

**File:** `supabase/migrations/20261019120200_conversations_compat.sql`

```sql
-- Sub-project 2 (expand): keep a cached old app (channel-based) and the new app (conversation-based) in step.
-- Removed by the contract migration.

create or replace function public.compat_default_conversation()
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.conversations where not archived order by created_at limit 1
$$;
revoke execute on function public.compat_default_conversation() from public, anon, authenticated;

-- New channel from an old app: map it to Main of the default conversation.
create or replace function public.channels_compat() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.conversation_id is null then
    new.conversation_id := public.compat_default_conversation();
    new.space := coalesce(new.space, 'main');
  end if;
  return new;
end $$;
drop trigger if exists channels_compat on public.channels;
create trigger channels_compat before insert on public.channels
  for each row execute function public.channels_compat();

-- The channel row that represents a conversation's space (for old-app reads).
create or replace function public.compat_channel_for(p_conversation uuid, p_space text)
returns uuid language sql stable security definer set search_path = '' as $$
  select c.id from public.channels c
   where c.conversation_id = p_conversation and c.space = p_space
   order by c.archived, c.position, c.created_at
   limit 1
$$;
revoke execute on function public.compat_channel_for(uuid, text) from public, anon, authenticated;

create or replace function public.messages_compat() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.conversation_id is null and new.channel_id is not null then
    select c.conversation_id, c.space into new.conversation_id, new.space
      from public.channels c where c.id = new.channel_id;
    if new.conversation_id is null then
      raise notice 'messages_compat: channel % is not mapped; using main', new.channel_id;
      new.conversation_id := public.compat_default_conversation();
      new.space := 'main';
    end if;
  elsif new.channel_id is null and new.conversation_id is not null then
    new.channel_id := public.compat_channel_for(new.conversation_id, new.space);
  end if;
  return new;
end $$;
drop trigger if exists messages_compat on public.messages;
create trigger messages_compat before insert or update of channel_id, conversation_id, space on public.messages
  for each row execute function public.messages_compat();

-- Sessions belong to the conversation; old apps see them on the Main channel.
create or replace function public.sessions_compat() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.conversation_id is null and new.channel_id is not null then
    select c.conversation_id into new.conversation_id from public.channels c where c.id = new.channel_id;
    new.conversation_id := coalesce(new.conversation_id, public.compat_default_conversation());
  elsif new.channel_id is null and new.conversation_id is not null then
    new.channel_id := public.compat_channel_for(new.conversation_id, 'main');
  end if;
  return new;
end $$;
drop trigger if exists sessions_compat on public.sessions;
create trigger sessions_compat before insert on public.sessions
  for each row execute function public.sessions_compat();

create or replace function public.pins_compat() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.conversation_id is null then
    select m.conversation_id into new.conversation_id from public.messages m where m.id = new.message_id;
  end if;
  if new.channel_id is null then
    select m.channel_id into new.channel_id from public.messages m where m.id = new.message_id;
  end if;
  return new;
end $$;
drop trigger if exists pins_compat on public.pinned_messages;
create trigger pins_compat before insert on public.pinned_messages
  for each row execute function public.pins_compat();

-- Old app writes a legacy custom status into profiles.status → map to the shared definition.
-- Automatic presence values (online/away/offline) leave status_id alone.
create or replace function public.profiles_status_compat() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status and new.status not in ('online', 'away', 'offline') then
    new.status_id := (select d.id from public.status_definitions d where d.legacy_key = new.status);
  end if;
  return new;
end $$;
drop trigger if exists profiles_status_compat on public.profiles;
create trigger profiles_status_compat before update of status on public.profiles
  for each row execute function public.profiles_status_compat();
```
- [ ] Write `030_compat.test.sql` first. Run it as Alice (`authenticated`), with the RLS from Task 6 not yet applied. For now, run the inserts as `postgres` and add the role-based variants in Task 6.
  - A message inserted with only `channel_id` (schist channel) gets `conversation_id` and `space = 'schist'`.
  - A message inserted with only `conversation_id`/`space='main'` gets the general `channel_id`.
  - An insert on an unmapped channel lands in Main.
  - A new channel insert is mapped to Main.
  - A session inserted with only `channel_id` gets `conversation_id`.
  - A pin inserted with only `channel_id` gets `conversation_id`.
  - Updating `profiles.status` to `'potential_eep'` sets the matching `status_id`.
  - Updating it to `'online'` keeps the existing `status_id`.
  - After deleting the `potential_eep` definition, setting `status='potential_eep'` gives `status_id` null and the update still succeeds.
- [ ] Green on `test:db`. `test:migration` is unchanged: it still fails only on media.
- [ ] Commit: `Add old-app compatibility triggers`

### Task 6: membership RLS and realtime authorisation

**File:** `supabase/migrations/20261019120300_conversations_rls.sql`

```sql
-- Sub-project 2 (expand): chat data is visible to conversation members only.

-- messages
drop policy if exists "Authenticated users can send messages" on public.messages;
drop policy if exists "Users can edit their own messages" on public.messages;
drop policy if exists "Users can view messages from visible sessions" on public.messages;
drop policy if exists "members read visible messages" on public.messages;
drop policy if exists "members send as themselves" on public.messages;
drop policy if exists "authors edit own messages" on public.messages;
create policy "members read visible messages" on public.messages for select to authenticated
  using (public.is_member(conversation_id)
         and exists (select 1 from public.sessions s where s.id = messages.session_id and s.visible));
create policy "members send as themselves" on public.messages for insert to authenticated
  with check (auth.uid() = author_id and public.is_member(conversation_id));
create policy "authors edit own messages" on public.messages for update to authenticated
  using (auth.uid() = author_id and public.is_member(conversation_id))
  with check (auth.uid() = author_id and public.is_member(conversation_id));

-- sessions (drag/fill go through definer RPCs; no client updates)
drop policy if exists "Authenticated users can create sessions" on public.sessions;
drop policy if exists "Authenticated users can update session visibility" on public.sessions;
drop policy if exists "Authenticated users can view visible sessions" on public.sessions;
drop policy if exists "members read visible sessions" on public.sessions;
drop policy if exists "members start sessions" on public.sessions;
create policy "members read visible sessions" on public.sessions for select to authenticated
  using (visible and public.is_member(conversation_id));
create policy "members start sessions" on public.sessions for insert to authenticated
  with check (visible and public.is_member(conversation_id));

-- pinned_messages
drop policy if exists "read pins" on public.pinned_messages;
drop policy if exists "pin" on public.pinned_messages;
drop policy if exists "unpin" on public.pinned_messages;
drop policy if exists "members read pins" on public.pinned_messages;
drop policy if exists "members pin" on public.pinned_messages;
drop policy if exists "members unpin" on public.pinned_messages;
create policy "members read pins" on public.pinned_messages for select to authenticated
  using (public.is_member(conversation_id));
create policy "members pin" on public.pinned_messages for insert to authenticated
  with check (auth.uid() = pinned_by and public.is_member(conversation_id));
create policy "members unpin" on public.pinned_messages for delete to authenticated
  using (public.is_member(conversation_id));

-- reactions (scoped through the message's conversation)
drop policy if exists "Authenticated users can add reactions" on public.reactions;
drop policy if exists "Authenticated users can view reactions" on public.reactions;
drop policy if exists "Users can remove their own reactions" on public.reactions;
drop policy if exists "members read reactions" on public.reactions;
drop policy if exists "members react as themselves" on public.reactions;
drop policy if exists "users remove own reactions" on public.reactions;
create policy "members read reactions" on public.reactions for select to authenticated
  using (exists (select 1 from public.messages m where m.id = reactions.message_id and public.is_member(m.conversation_id)));
create policy "members react as themselves" on public.reactions for insert to authenticated
  with check (auth.uid() = user_id
              and exists (select 1 from public.messages m where m.id = reactions.message_id and public.is_member(m.conversation_id)));
create policy "users remove own reactions" on public.reactions for delete to authenticated
  using (auth.uid() = user_id);

-- new tables
drop policy if exists "members read conversations" on public.conversations;
create policy "members read conversations" on public.conversations for select to authenticated
  using (public.is_member(id));

drop policy if exists "members read membership" on public.conversation_members;
create policy "members read membership" on public.conversation_members for select to authenticated
  using (public.is_member(conversation_id));

-- Own position always; someone else's only when BOTH have read receipts on. Writes go through mark_read().
drop policy if exists "read positions per receipts setting" on public.read_positions;
create policy "read positions per receipts setting" on public.read_positions for select to authenticated
  using (
    user_id = auth.uid()
    or (public.is_member(conversation_id)
        and (select p.read_receipts from public.profiles p where p.id = auth.uid())
        and (select p.read_receipts from public.profiles p where p.id = read_positions.user_id))
  );

drop policy if exists "anyone signed in reads statuses" on public.status_definitions;
drop policy if exists "anyone signed in adds statuses" on public.status_definitions;
drop policy if exists "anyone signed in edits statuses" on public.status_definitions;
drop policy if exists "anyone signed in deletes statuses" on public.status_definitions;
create policy "anyone signed in reads statuses" on public.status_definitions for select to authenticated using (true);
create policy "anyone signed in adds statuses" on public.status_definitions for insert to authenticated with check (true);
create policy "anyone signed in edits statuses" on public.status_definitions for update to authenticated using (true) with check (true);
create policy "anyone signed in deletes statuses" on public.status_definitions for delete to authenticated using (true);

-- Realtime Authorization: private channel "conv:<uuid>" is for that conversation's members only.
create or replace function public.topic_conversation(p_topic text)
returns uuid language sql immutable set search_path = '' as $$
  select case when p_topic ~ '^conv:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then substring(p_topic from 6)::uuid end
$$;

drop policy if exists "members receive conversation events" on realtime.messages;
drop policy if exists "members send conversation events" on realtime.messages;
create policy "members receive conversation events" on realtime.messages for select to authenticated
  using (public.is_member(public.topic_conversation(realtime.topic())));
create policy "members send conversation events" on realtime.messages for insert to authenticated
  with check (public.is_member(public.topic_conversation(realtime.topic())));
```
- [ ] Write `040_rls.test.sql` first. Run it as Alice, Bea and Cleo after Task 8's seed exists; until then, insert a minimal conversation inside the test transaction as `postgres`.
  - Cleo sees zero rows in messages, sessions, pins, reactions, conversations, members and media.
  - Alice cannot insert a message as Bea (`42501`).
  - Alice cannot insert into a conversation she isn't in.
  - Hidden sessions and their messages are invisible to members.
  - `update public.sessions set visible = true` as Alice affects 0 rows.
  - Statuses are readable and writable by Cleo too (anyone signed in).
  - `topic_conversation('conv:not-a-uuid')` is null, and an `is_member` check on it is false.
- [ ] Write `041_read_receipts.test.sql`: a 2×2 matrix of Alice/Bea receipts on/off. Alice always sees her own row, and sees Bea's only when both are on.
- [ ] Add the role-based variants to `030_compat.test.sql`: an old-app insert as Alice with only `channel_id` passes RLS, because `WITH CHECK` runs after the BEFORE trigger.
- [ ] Green on `test:db`.
- [ ] Commit: `Restrict chat data to conversation members; authorise private realtime topics`

### Task 7: media index and RPCs

**File:** `supabase/migrations/20261019120400_message_media.sql`

```sql
-- Sub-project 2 (expand): server-side media index (attachments + links) for the gallery.

create table if not exists public.message_media (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  space text not null check (space in ('main', 'schist')),
  session_id uuid not null references public.sessions(id) on delete cascade,
  kind text not null check (kind in ('image', 'video', 'gif', 'file', 'audio', 'link')),
  url text not null,
  filename text,
  extension text,
  size bigint,
  created_at timestamptz not null
);
create index if not exists message_media_conv_kind_created_idx on public.message_media (conversation_id, kind, created_at desc, id desc);
create index if not exists message_media_conv_ext_idx on public.message_media (conversation_id, extension);
create index if not exists message_media_message_idx on public.message_media (message_id);
alter table public.message_media enable row level security;

drop policy if exists "members read visible media" on public.message_media;
create policy "members read visible media" on public.message_media for select to authenticated
  using (public.is_member(conversation_id)
         and exists (select 1 from public.sessions s where s.id = message_media.session_id and s.visible));

-- ".ZIP", "zip", " .zip " → "zip"; blank → null
create or replace function public.normalize_extension(p text)
returns text language sql immutable set search_path = '' as $$
  select nullif(lower(regexp_replace(btrim(coalesce(p, '')), '^\.+', '')), '')
$$;

-- "raid.PMP" → "pmp"; "README" → null
create or replace function public.file_extension(p_filename text)
returns text language sql immutable set search_path = '' as $$
  select lower(substring(p_filename from '\.([^./\\]+)$'))
$$;

create or replace function public.rebuild_message_media(m public.messages)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.message_media where message_id = m.id;
  if m.deleted or m.conversation_id is null or m.space is null then return; end if;

  insert into public.message_media (message_id, conversation_id, space, session_id, kind, url, filename, extension, size, created_at)
  select m.id, m.conversation_id, m.space, m.session_id,
         case when a->>'type' in ('image', 'video', 'gif', 'file', 'audio') then a->>'type' else 'file' end,
         a->>'url', a->>'filename', public.file_extension(a->>'filename'),
         case when a->>'size' ~ '^[0-9]+(\.[0-9]+)?$' then (a->>'size')::numeric::bigint end,
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

create or replace function public.sync_message_media() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.rebuild_message_media(new);
  return null;
end $$;
drop trigger if exists messages_sync_media on public.messages;
create trigger messages_sync_media
  after insert or update of content, attachments, deleted, conversation_id, space, session_id on public.messages
  for each row execute function public.sync_message_media();

-- Backfill (delete + insert per message, so re-running is safe)
select public.rebuild_message_media(m) from public.messages m;

-- Gallery query. RLS (invoker) applies membership and Drag-the-Lake visibility.
create or replace function public.get_media(
  p_conversation uuid,
  p_space text default null,
  p_kinds text[] default null,
  p_extension text default null,
  p_before timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 60
) returns setof public.message_media
language sql stable security invoker set search_path = '' as $$
  select mm.* from public.message_media mm
   where mm.conversation_id = p_conversation
     and (p_space is null or mm.space = p_space)
     and (p_kinds is null or mm.kind = any (p_kinds))
     and (public.normalize_extension(p_extension) is null or mm.extension = public.normalize_extension(p_extension))
     and (p_before is null
          or mm.created_at < p_before
          or (p_before_id is not null and mm.created_at = p_before and mm.id < p_before_id))
   order by mm.created_at desc, mm.id desc
   limit least(greatest(coalesce(p_limit, 60), 1), 200)
$$;
revoke execute on function public.get_media(uuid, text, text[], text, timestamptz, uuid, integer) from public, anon;
grant execute on function public.get_media(uuid, text, text[], text, timestamptz, uuid, integer) to authenticated;
```

- [ ] Write `050_media.test.sql` first.
  - **Normalisation:** `normalize_extension` on `'.ZIP'`, `'zip'`, `' .zip '` and `'..zip'` gives `'zip'`; blank gives null.
  - **Extensions:** `file_extension('raid.PMP')` gives `'pmp'`, `('README')` gives null, `('a.tar.gz')` gives `'gz'`.
  - **Rebuilds:**
    - An insert with two attachments and one link gives 3 rows.
    - Editing the content to drop the link gives 2.
    - Setting `deleted = true` gives 0.
  - **Links:** a trailing period is trimmed, and the host is lowercase.
  - **Filters:** `get_media` with each kind; `p_extension` in all three spellings returns the same rows; `p_space` null versus `'main'`.
  - **Visibility:** hidden-session media is invisible to Alice.
  - **Paging:** two attachments on one message straddling a page boundary are both returned across two pages using `(p_before, p_before_id)`.
- [ ] **File:** `supabase/migrations/20261019120500_conversations_rpcs.sql`
```sql
-- Sub-project 2 (expand): message history, read positions, PIN, Drag/Fill the Lake.

create or replace function public.get_messages(
  p_conversation uuid, p_space text, p_limit integer default 50, p_before timestamptz default null
) returns setof public.messages
language sql stable security invoker set search_path = '' as $$
  select m.* from public.messages m
    join public.sessions s on s.id = m.session_id and s.visible
   where m.conversation_id = p_conversation and m.space = p_space and not m.deleted
     and (p_before is null or m.created_at < p_before)
   order by m.created_at desc
   limit least(greatest(coalesce(p_limit, 50), 1), 200)
$$;

create or replace function public.require_member(p_conversation uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_member(p_conversation) then
    raise exception 'not a member of this conversation' using errcode = '42501';
  end if;
end $$;
revoke execute on function public.require_member(uuid) from public, anon, authenticated;

create or replace function public.mark_read(p_conversation uuid, p_space text, p_at timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_member(p_conversation);
  if p_space is null or p_space not in ('main', 'schist') then
    raise exception 'unknown space %', p_space using errcode = '22023';
  end if;
  insert into public.read_positions as rp (conversation_id, user_id, space, last_read_at)
  values (p_conversation, auth.uid(), p_space, least(p_at, now()))
  on conflict (conversation_id, user_id, space)
  do update set last_read_at = greatest(rp.last_read_at, excluded.last_read_at);
end $$;

create or replace function public.set_pin(p_pin text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if p_pin is null or p_pin !~ '^[0-9]{4,6}$' then
    raise exception 'PIN must be 4–6 digits' using errcode = '22023';
  end if;
  insert into public.private_pins (user_id, pin_hash)
  values (auth.uid(), extensions.crypt(p_pin, extensions.gen_salt('bf')))
  on conflict (user_id) do update set pin_hash = excluded.pin_hash;
  -- lock_pin is kept in step only for cached old apps; the contract migration drops it.
  update public.profiles set lock_pin_length = char_length(p_pin), lock_pin = p_pin where id = auth.uid();
end $$;

create or replace function public.clear_pin()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  delete from public.private_pins where user_id = auth.uid();
  update public.profiles set lock_pin_length = null, lock_pin = null where id = auth.uid();
end $$;

create or replace function public.verify_pin(p_pin text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select pp.pin_hash = extensions.crypt(p_pin, pp.pin_hash)
       from public.private_pins pp where pp.user_id = auth.uid()),
    false)
$$;

create or replace function public.drag_the_lake(p_conversation uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform public.require_member(p_conversation);
  perform 1 from public.conversations where id = p_conversation for update; -- serialise concurrent drags
  update public.sessions set visible = false where conversation_id = p_conversation and visible;
  insert into public.sessions (conversation_id, created_by, visible)
  values (p_conversation, auth.uid(), true) returning id into v_id;
  return v_id;
end $$;

create or replace function public.lake_password_ok(p_password text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select s.value_hash = extensions.crypt(p_password, s.value_hash)
       from public.private_secrets s where s.key = 'lake_password'),
    false)
$$;
revoke execute on function public.lake_password_ok(text) from public, anon, authenticated;

create or replace function public.fill_the_lake(p_conversation uuid, p_password text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_member(p_conversation);
  if p_password is null or not public.lake_password_ok(p_password) then return false; end if;
  update public.sessions set visible = true where conversation_id = p_conversation and not visible;
  return true;
end $$;

create or replace function public.set_lake_password(p_current text, p_new text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null
     or not exists (select 1 from public.conversation_members where user_id = auth.uid()) then
    raise exception 'only conversation members can change the lake password' using errcode = '42501';
  end if;
  if btrim(coalesce(p_new, '')) = '' then
    raise exception 'the new lake password cannot be blank' using errcode = '22023';
  end if;
  if p_current is null or not public.lake_password_ok(p_current) then return false; end if;
  update public.private_secrets set value_hash = extensions.crypt(p_new, extensions.gen_salt('bf'))
   where key = 'lake_password';
  return true;
end $$;

-- Old app: Drag the Lake per channel → drags the whole conversation.
create or replace function public.change_sheets(p_channel_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_conv uuid;
begin
  select conversation_id into v_conv from public.channels where id = p_channel_id;
  if v_conv is null then raise exception 'channel % is not mapped to a conversation', p_channel_id; end if;
  return public.drag_the_lake(v_conv);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.get_messages(uuid, text, integer, timestamptz)',
    'public.mark_read(uuid, text, timestamptz)',
    'public.set_pin(text)', 'public.clear_pin()', 'public.verify_pin(text)',
    'public.drag_the_lake(uuid)', 'public.fill_the_lake(uuid, text)',
    'public.set_lake_password(text, text)', 'public.change_sheets(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
```
- [ ] Write `060_rpcs.test.sql` first.
  - **PIN:**
    - `set_pin` rejects `'123'`, `'1234567'` and `'12a4'` (`22023`).
    - `verify_pin` gives true for the right PIN and false for a wrong one, and false for Cleo, who has no PIN.
    - `clear_pin` → false afterwards and `lock_pin_length` null.
  - **Read positions:** `mark_read` called with a later and then an earlier time keeps the later one; a time in the future is clamped to `now()`; Cleo gets `42501`.
  - **Drag the Lake:** afterwards Alice sees exactly one visible session and zero old messages; it works across both spaces.
  - **Fill the Lake:** `'wrong'` → false and nothing changes; the right password → true and every session is visible.
  - **Lake password:** `set_lake_password` with a wrong current → false; a blank new → `22023`; Cleo → `42501`; after a change, the old password fails and the new one works.
  - **Old app:** `change_sheets(general channel)` drags the conversation.
  - **Grants:** `anon` cannot execute `verify_pin` (`has_function_privilege`).
- [ ] `npm run test:db` is green and **`npm run test:migration` is green**, including the re-run.
- [ ] Commit (one commit for both files): `Add media index, gallery query and conversation RPCs`

### Task 8: seed in the new shape

**File:** `supabase/seed.sql` (rewrite; keep the header comments and the auth insert pattern)

Fixed IDs, recorded in `e2e/users.ts` as `IDS`:
- conversation `d0000000-0000-4000-8000-000000000001`
- channels: general `aaaaaaaa-0000-4000-8000-000000000001` (main) and schist `aaaaaaaa-0000-4000-8000-000000000002` (schist), with `conversation_id` set explicitly
- sessions: current visible `bbbbbbbb-0000-4000-8000-000000000001`, and a **hidden** older `bbbbbbbb-0000-4000-8000-000000000002` created 1 day ago
- Alice, Bea and Cleo. Members: Alice and Bea only.

Content:
- **Main:** the 3 existing seed messages.
- **Schist:** `Seed: schist hello` from Bea.
- **Hidden session (Main):** `Seed: from the lake`, which Fill the Lake should bring back.
- **Media in Main:** an image (`http://cdn.test.local/media/test-image.png`), a video (`…/clip.mp4`), a GIF, files `raid.PMP` and `notes.zip`, and a link message `Seed: see https://example.com/guide`.
- **Existing items:** the reaction, a pin (with `conversation_id`), custom emoji and the Eep passphrase.
- **Statuses:** the 4 statuses come from the migration. Alice gets `status_id = found_out` for the status tests.
- **PINs:**
  - `insert into private_pins` with `extensions.crypt('1234', gen_salt('bf'))` for Alice and `'567890'` for Bea.
  - Set `lock_pin_length` 4/6, and `lock_pin` for compatibility.
- **Lake password:** `update private_secrets set value_hash = extensions.crypt('test-lake-password', extensions.gen_salt('bf')) where key = 'lake_password'`.

- [ ] Add `020_seed_shape.test.sql`: exactly one conversation; Alice and Bea are members and Cleo isn't; both channels are mapped. Update every database test that inlined its own conversation to use the seed IDs.
- [ ] `npm run db:reset && npm run test:db && npm run test:migration` are all green.
- [ ] The **existing e2e suite is expected to fail now**, because the app still uses `get_channel_messages` with channel IDs and the new RLS. Don't fix that here. Task 12 makes it green again.
- [ ] Commit: `Seed conversations, both spaces, media and secrets for local tests`

### Task 9: types and pure helpers

**Files:** `src/types/index.ts`, `src/lib/spaces.ts`, `src/lib/spaces.test.ts`, `src/lib/status.ts`, `src/lib/status.test.ts`

- [ ] **Types.** `Channel` stays until Task 12 removes its last import, then delete it.
```ts
export type Space = 'main' | 'schist'
export type Presence = 'online' | 'away' | 'offline'
export type MediaKind = 'image' | 'video' | 'gif' | 'file' | 'audio' | 'link'

export interface Conversation { id: string; title: string | null; archived: boolean; created_by: string | null; created_at: string }
export interface ReadPosition { conversation_id: string; user_id: string; space: Space; last_read_at: string }
export interface StatusDefinition {
  id: string; label: string; color: string; position: number; legacy_key: string | null
  created_by: string | null; created_at: string; updated_at: string
}
export interface MediaItem {
  id: string; message_id: string; conversation_id: string; space: Space; session_id: string
  kind: MediaKind; url: string; filename: string | null; extension: string | null; size: number | null; created_at: string
}
// Profile: add status_id: string | null; read_receipts: boolean; lock_pin_length: number | null
// Message: add conversation_id: string; space: Space; channel_id becomes string | null
// Session: add conversation_id: string; channel_id becomes string | null
// PinnedMessage: add conversation_id: string; channel_id becomes string | null
// Attachment.type: add 'audio'
```
- [ ] **`src/lib/spaces.ts`.** Write the tests first:
```ts
export const SPACES = ['main', 'schist'] as const satisfies readonly Space[]
export const SPACE_LABEL: Record<Space, string> = { main: 'Main', schist: 'Schist' }
export const spaceKey = (conversationId: string, space: Space) => `${conversationId}:${space}`

/** Mirrors the SQL normalize_extension: ".ZIP", "zip", " .zip " → "zip"; blank → null. */
export function normalizeExtension(input: string | null | undefined): string | null

/** A space is unread when its newest message is newer than my read position and wasn't sent by me. */
export function isUnread(args: { latestAt: string | null; latestAuthorId: string | null; lastReadAt: string | null; myId: string | null }): boolean
```
  - `normalizeExtension`: the same cases as the SQL test, plus `'.tar.gz'` → `'tar.gz'`, so both implementations agree. The SQL strips only leading dots, so the outputs match.
  - `isUnread`:
    - no latest → false
    - no read position → true unless the latest message is mine
    - equal timestamps → false
    - newer → true
    - mine → false even if newer
- [ ] **`src/lib/status.ts`** replaces `statusColor`/`statusLabel`. Tests first:
```ts
/** Legacy custom values stored in profiles.status (old app) count as 'online' for the presence dot. */
export function presenceOf(status: string | null | undefined): Presence
export function presenceColor(p: Presence): string   // the existing hsl(var(--color-status-*)) values
export function presenceLabel(p: Presence): string   // Online / Away / Offline
```
  Update every caller of `statusColor(`/`statusLabel(` (grep for them) to use `presenceOf` with these helpers. Where the old code displayed a legacy alert status as the label, show the custom status from the `statusStore` instead (that wiring lands in Task 15; until then, presence only).
- [ ] Commit: `Add conversation types and space/status helpers`

### Task 10: read scheduler

**Files:** `src/lib/readScheduler.ts`, `src/lib/readScheduler.test.ts`

- [ ] Tests first, using fake timers. Then implement:
```ts
/**
 * Debounces mark_read calls per space and never sends an older timestamp than one already sent.
 * send() failures are swallowed; the next schedule() retries with the newest timestamp.
 */
export function createReadScheduler(send: (space: Space, at: string) => Promise<void>, delayMs = 500): {
  schedule(space: Space, at: string): void
  flush(): Promise<void>
  dispose(): void
}
```
  Cases:
  - Three calls within the delay → one send, with the max timestamp.
  - A call with an older timestamp after a send → no send.
  - The two spaces are independent.
  - `dispose` cancels pending sends.
  - A rejected send doesn't block the next schedule.
- [ ] Commit: `Add debounced forward-only read scheduler`

### Task 11: conversation, message and typing stores

**Files:** `src/stores/conversationStore.ts` (+ test), `src/stores/messageStore.ts` (+ test), `src/stores/typingStore.ts`

- [ ] **`conversationStore`** (Zustand). Write the tests first, mocking `@/lib/supabase` like `uiStore.test.ts` does.
```ts
interface ConversationState {
  conversation: Conversation | null
  memberIds: string[]
  activeSpace: Space
  activeSession: Session | null
  readAt: Record<Space, string | null>          // my read positions
  latest: Record<Space, { at: string; authorId: string } | null>
  loading: boolean
  load(myId: string): Promise<void>             // first non-archived conversation visible to me (RLS), its members, newest visible session, my read positions, latest per space
  setActiveSpace(space: Space): void
  getOrCreateSession(): Promise<Session | null> // newest visible session, else insert { conversation_id, visible: true }
  dragTheLake(): Promise<void>                  // optimistic: clear messages for both spaces; rpc('drag_the_lake'); set activeSession from returned id; broadcast 'lake'
  fillTheLake(password: string): Promise<'filled' | 'wrong' | 'error'> // rpc('fill_the_lake'); on true: reload + broadcast 'lake'
  reloadAfterLake(): Promise<void>              // refetch session + messages for both spaces + latest
  noteMessage(m: Message): void                 // bump latest[m.space] when newer
  applyReadPosition(rp: ReadPosition, myId: string): void // only my rows; forward-only
  markReadLocal(space: Space, at: string): void // forward-only local update (scheduler sends to server)
  reset(): void                                 // on sign-out
}
```
  The `activeSpace` starts as `'main'`. Persist the last-used space in `sessionStorage` (`activeSpace`), so a refresh returns to the same space. Read it in a `try`/`catch`.

  Tests:
  - `load` picks the conversation and fills `latest` for both spaces.
  - `noteMessage` ignores older messages.
  - `applyReadPosition` ignores other users and older times.
  - `dragTheLake` clears both spaces' messages before the RPC resolves.
  - `fillTheLake` maps `false` to `'wrong'` and an RPC error to `'error'`.
- [ ] **`messageStore`:**
  - Key by `spaceKey`.
  - `fetchMessages(conversationId, space)` uses `rpc('get_messages', { p_conversation, p_space, p_limit: 50 })`, and reverses the result for display.
  - Other actions take a `key`.
  - Add `clearConversation(conversationId)`, which clears both keys.
  - Update `editMessage`/`deleteMessage` signatures to take a `key`.
  - Unit test: messages stay separated per space, and duplicate IDs are ignored.
- [ ] **`typingStore`:** `typing: Record<Space, { user_id: string; nickname: string; at: number }[]>`, with `noteTyping(space, user)` and `prune(now)`. The 5 s expiry is kept. It is consumed by `useTyping`.
- [ ] Commit: `Add conversation, per-space message and typing stores`

### Task 12: realtime module and rewiring the UI (the app works end to end again)

**Files:**
- **Create:** `src/lib/conversationRealtime.ts`, `src/hooks/useConversationRealtime.ts`, `src/components/spaces/SpaceList.tsx`
- **Rewrite:** `useMessages.ts`, `useTyping.ts`, `usePinnedMessages.ts`
- **Modify:** `AppShell.tsx`, `Sidebar.tsx`, `ChannelHeader.tsx`, `SheetsButton.tsx`, `MessageList.tsx`, `MessageInput.tsx`, `MessageItem.tsx`, `TypingIndicator.tsx`, `ChannelInfoPanel.tsx` (pins and search tabs only; media is Task 16), `presenceStore.ts`, `App.tsx` (load the conversation after auth), `e2e/users.ts`, `e2e/fixtures.ts`
- **Delete:** `channelStore.ts`, `useChannels.ts`, `CreateChannelModal.tsx`, `ChannelList.tsx`

- [ ] **`conversationRealtime.ts`.** A module-level singleton, because only one subscription may exist per device:
```ts
type Status = 'CLOSED' | 'JOINING' | 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT'
export function joinConversation(conversationId: string, handlers: {
  onMessage(m: Message, kind: 'new' | 'edit' | 'delete'): void
  onTyping(space: Space, user: { user_id: string; nickname: string }): void
  onLake(): void
  onReadPosition(rp: ReadPosition): void
  onStatus(s: Status, rejoined: boolean): void
}): () => void  // returns leave()
export function sendMessageEvent(kind: 'new' | 'edit' | 'delete', m: Message | { id: string; space: Space }): void
export function sendTyping(space: Space, user: { user_id: string; nickname: string }): void
export function sendLake(): void
```
  - **Channel:** `supabase.channel(\`conv:${id}\`, { config: { private: true, broadcast: { self: false } } })`.
  - **Broadcast events:** `message` `{ kind, message }`, `typing` `{ space, user_id, nickname }`, `lake` `{}`.
  - **`postgres_changes` safety nets:**
    - `INSERT`/`UPDATE` on `messages` with `filter: conversation_id=eq.<id>`. An update with `deleted = true` maps to `'delete'`.
    - `*` on `sessions` with the same filter maps to `onLake()`, debounced by 250 ms.
    - `INSERT`/`UPDATE` on `read_positions` with the same filter.
  - Before subscribing, call `await supabase.realtime.setAuth()` so the private channel carries the user's token.
  - If `postgres_changes` bindings turn out not to work on a private channel in the local stack, move them to a second, non-private channel, `conv-db:<id>`. That's safe because `postgres_changes` already applies RLS per subscriber. Note the change in the commit message.
  - On a re-`SUBSCRIBED`, call `onStatus(…, true)`. The caller then refetches.
- [ ] **`useConversationRealtime()`.** Mount it once in `AppShell`. It joins when `conversation` is set and wires the handlers:
  - **`onMessage`:**
    - `new`: `addMessage(spaceKey(...), m)` plus `noteMessage(m)`.
    - `edit`: `updateMessage`.
    - `delete`: `removeMessage`.
  - **`onTyping`:** `typingStore.noteTyping`.
  - **`onLake`:** `reloadAfterLake()`.
  - **`onReadPosition`:** `applyReadPosition`.
  - **Status:** exposes the realtime status through a small field in `conversationStore` (`realtimeStatus`), so `MessageList` keeps rendering `data-realtime`.
- [ ] **Hooks:**
  - `useMessages(conversationId, space)` fetches on mount and on change, and returns `{ messages, loading, realtimeStatus }`. Edit and delete broadcasts go through `sendMessageEvent`.
  - `useTyping(space)` reads `typingStore` (pruned every second by one interval in the hook), and `sendTyping` is throttled to 3 s, as today.
  - `usePinnedMessages(conversationId)` returns pinned message IDs for the whole conversation. Realtime is `postgres_changes` on `pinned_messages` filtered by `conversation_id`. Inserts send `{ conversation_id, message_id, pinned_by }`.
- [ ] **`SpaceList`:**
  - Two buttons, **Main** and **Schist**, in today's channel-row styling with the `#` icon removed.
  - When unread, the label is bold and a small dot appears, using the existing `--color-text-primary`/brand tokens.
  - Attributes: `data-space={space}`, `data-unread={String(unread)}`, `aria-current` when active.
  - It replaces `ChannelList` in `Sidebar` and `MobileChannelList` in `AppShell`, under a "Spaces" header instead of "Text Channels". The create (+) button is removed.
- [ ] **`AppShell`:**
  - Replace `fetchChannels`/`activeChannel` with `conversationStore` (`load` on mount when `user` is set).
  - `ChannelHeader`, `MessageList`, `MessageInput` and `ChannelInfoPanel` receive `{ conversationId, space }`. The header shows `SPACE_LABEL[space]`.
  - The mobile list → chat navigation is unchanged.
  - The reply and info-panel state reset when the space changes.
- [ ] **`ChannelHeader`:** remove the archive item and the channel-settings menu. The Drag the Lake button stays.
- [ ] **`SheetsButton`, `/drag`:** call `dragTheLake()`. The draft is not cleared, because drafts live in the module map.
- [ ] **`MessageInput`:**
  - Inserts `{ conversation_id, space, session_id, author_id, content, attachments, type }`, without `channel_id`, and then `sendMessageEvent('new', data)` plus `noteMessage`.
  - The draft key is `spaceKey`, and the upload path is `messages/${conversationId}`.
  - The placeholder is `Message #${SPACE_LABEL[space]}`, which keeps the e2e locator.
- [ ] **`MessageList`: mark-read.**
  - Create one `createReadScheduler((space, at) => rpc('mark_read', …))` per mounted list.
  - Call `schedule(space, newest.created_at)` when **all** of these hold:
    - the list is within 150 px of the bottom
    - `document.visibilityState === 'visible'`
    - `!useUiStore.getState().eepMode`
    - the newest message exists

    Re-check on new messages, on scroll, and on `visibilitychange`.
  - Call `markReadLocal` immediately, so the dot clears without waiting.
  - Call `flush()` on `pagehide`, and `dispose()` on unmount.
- [ ] **`MessageItem`:** the props pass `key` (`spaceKey`) instead of `channelId`, for edit and delete. The per-message reaction subscription stays as is; reactions are redesigned in sub-project 3.
- [ ] **`ChannelInfoPanel`:**
  - **Pins tab:** pinned IDs come from `usePinnedMessages(conversationId)`, then the messages are fetched and filtered to `space`.
  - **Search tab:** `.eq('conversation_id', …).eq('space', space)`.
- [ ] **`presenceStore`:** delete `startTyping`/`subscribeTyping`, which have no callers (grep to confirm).
- [ ] **e2e:**
  - `users.ts` gains `IDS` (conversation, sessions, channels) and `LAKE_PASSWORD = 'test-lake-password'`.
  - `ChatUser.openChat(space: 'Main' | 'Schist' = 'Main')` clicks `getByRole('button', { name: space })`, visible-filtered, then waits for the composer and `[data-realtime="SUBSCRIBED"]`.
  - Every existing spec is updated to call `openChat()`.
- [ ] Run `npm run db:reset && npm run e2e`. All 18 existing tests pass again, which is the regression gate for the rewire. `tsc -b`, `lint` and `npm test` are green.
- [ ] Commit: `Move the app onto conversations and spaces with one private realtime channel`

### Task 13: PIN through RPCs

**Files:** `src/stores/uiStore.ts`, `src/stores/uiStore.test.ts`, `src/components/eep/EepMode.tsx`, `src/components/user/UserSettings.tsx`, `e2e/pin-lock.spec.ts`

- [ ] **`uiStore` tests first:**
  - `loadPin` reads `lock_pin_length` only. It never selects `lock_pin`; assert on the mocked `select` argument.
  - `setPin(pin)` calls `rpc('set_pin', { p_pin })`, throws on error and sets `pinLength`.
  - `clearPinRemote()` calls `rpc('clear_pin')`.
  - `verifyPin(pin)` returns the RPC boolean and **throws** on an RPC error, so the pad shows "Couldn't verify. Try again." and the app stays locked.
  - Remove `pinCode` from the state.
- [ ] **Callers:**
  - `EepMode`'s `verify` becomes `verifyPin`.
  - In `UserSettings`, `verifyCurrentPin` becomes `verifyPin`, and the set flows call `setPin`/`clearPinRemote`.
  - The "has a PIN" checks use `pinLength !== null` instead of `pinCode`.
- [ ] **e2e:** add a test where Alice sets a **5-digit** PIN in Settings, backgrounds the app, and unlocks with it. Restore `1234` at the end, or rely on the per-run DB reset; the suite resets in global setup.
- [ ] Commit: `Verify and set the PIN on the server`

### Task 14: Settings: Fill the Lake, lake password, read receipts

**Files:** `src/components/user/UserSettings.tsx`, plus a small `src/components/user/LakeSettings.tsx` (+ test)

- [ ] **`LakeSettings`.** Component tests first, with the store mocked. It goes in the same settings tab as the PIN section, styled like that section. It contains:
  - **Fill the Lake:** a password field with the label "Lake password" and a **Fill the Lake** button.
    - States: idle → working → "Lake filled." or "Wrong password." or "Couldn't fill the lake. Try again."
    - The field clears on success. Enter submits.
  - **Change lake password:** "Current lake password", "New lake password" and **Save**.
    - It calls `rpc('set_lake_password')` and shows "Lake password changed.", "Current password is wrong." or the error message.
    - It is disabled while the new password is blank.
  - **Read receipts:** a switch labelled "Read receipts", with the help text "If you turn this off, you won't see when others have read your messages either."
    - It updates `profiles.read_receipts` for my row, optimistically, and reverts on error.
- [ ] **e2e:** add `e2e/lake.spec.ts` (written here, run in Task 17).
- [ ] Commit: `Add Fill the Lake, lake password and read receipts settings`

### Task 15: shared statuses

**Files:** `src/stores/statusStore.ts` (+ test), `src/components/user/StatusPicker.tsx`, callers of the old status helpers

- [ ] **`statusStore`.** Tests first.
  - It loads `status_definitions` ordered by `position, created_at`.
  - It subscribes once (from `AppShell`) to `postgres_changes` `*` on `status_definitions` and keeps the list in step.
  - `create({ label, color })`, `update(id, patch)` and `remove(id)`.
  - Validation, matching the database: the label is trimmed and 1–40 characters, and the colour matches `/^#[0-9a-f]{6}$/i`. Invalid input is rejected without calling the server.
- [ ] **`StatusPicker`.** Same modal and styling, with these sections:
  1. **Presence:** Online / Away / Invisible. This is unchanged behaviour: it writes `profiles.status` and calls `updatePresence`.
  2. **Custom status:** a "None" row, then one row per definition with a colour dot and label.
     - Clicking a row selects it.
     - A pencil button edits it inline: a label input and an `<input type="color">`, with Save/Cancel. A trash button deletes it after a confirm (`window.confirm` is fine for now).
     - "+ New status" adds a row in edit mode.
  3. **Status message:** a text input, max 128 characters. The emoji input is removed.

  **Save** writes `{ status: presence, status_id, custom_status_text }`. It no longer writes `custom_status_emoji`.
- [ ] **Display.** Wherever a profile's custom status was shown (grep for `custom_status_text` and the old helpers in `UserPanel`, `MemberList`, `UserProfile`, `UserProfileFull`), show the definition's label in its colour as plain coloured text plus the message. The pill design is deferred. The presence dot uses `presenceOf`.
- [ ] **e2e:** add `e2e/statuses.spec.ts` (written here, run in Task 17).
- [ ] Commit: `Use shared coloured statuses and a text-only status message`

### Task 16: media gallery filters

**Files:** `src/components/chat/ChannelInfoPanel.tsx` (media tab), `src/components/chat/MediaFilters.tsx` (+ test), `src/hooks/useMediaGallery.ts` (+ test)

- [ ] **`useMediaGallery({ conversationId, space, scope, kind, extension })`.** Tests first, with the RPC mocked.
  - Calls `rpc('get_media', { p_conversation, p_space: scope === 'both' ? null : space, p_kinds, p_extension: normalizeExtension(extension), p_before, p_before_id, p_limit: 60 })`.
  - `kind` maps to `p_kinds`: `all` → `['image','video','gif']`, `photos` → `['image']`, `videos` → `['video']`, `gifs` → `['gif']`, `files` → `['file']`, `links` → `['link']`, `voice` → `['audio']`.
  - **When an extension is set and `kind === 'all'`,** search every kind (`p_kinds: null`), so `.zip` finds files from the All chip.
  - `loadMore()` uses the last item's `(created_at, id)`.
  - Typing in the extension box is debounced by 300 ms.
  - Any filter change resets the list.
  - Stale responses are ignored; there's a request counter.
- [ ] **`MediaFilters`:**
  - Chips: All · Photos · Videos · GIFs · Files · Links · Voice, styled like the existing tab buttons.
  - An "Extension (e.g. zip)" input, with an `×` to clear it.
  - A "This space / Both" two-button toggle.
- [ ] **Media tab rendering:**
  - **Visual kinds** use the existing thumbnail grid and `MediaViewer`.
  - **Files** are a list: filename, extension badge, size in KB/MB, and the link opens in a new tab.
  - **Links** are a list: host plus the full URL, opening in a new tab with `rel="noopener noreferrer"`.
  - **Voice** shows the empty state "No voice memos yet".
  - **Load more** is either a sentinel `IntersectionObserver` or a "Load more" button. Use the button if the observer complicates tests.
- [ ] **e2e:** add `e2e/media.spec.ts` (written here, run in Task 17).
- [ ] Commit: `Filter the media gallery by type, extension and space`

### Task 17: two-user e2e specs

**Files:** `e2e/spaces.spec.ts`, `e2e/lake.spec.ts`, `e2e/statuses.spec.ts`, `e2e/media.spec.ts`, `e2e/compat.spec.ts`, and helpers in `e2e/fixtures.ts`

Add these helpers: `ChatUser.openSpace(name)`, `spaceButton(name)` (visible-filtered), `openSettings()`, `openInfoPanel('media')`, and `serviceClient()` (supabase-js with the local **service role** key, read from `npx supabase status -o env` in global setup and written to `e2e/.auth/env.json`, so it is never committed).

- [ ] **`spaces.spec.ts`:**
  - Alice sends in Schist while Bea sits in Main. Bea's Schist button gets `data-unread="true"` within 5 s, and the message doesn't appear in Bea's Main.
  - Bea opens Schist, the message is visible, and `data-unread` becomes `false`.
  - **Cross-device:** Bea's `secondDevice` (a second context, same storage state) sees Schist go from unread to read within 5 s, without reloading.
  - Typing in Schist shows "Alice is typing" only in Bea's Schist, not in Main.
- [ ] **`lake.spec.ts`:**
  - Alice drags. Bea's Main and Schist both clear live, Bea's unsent draft survives, and a new message from Bea after the drag is visible to both.
  - Alice opens Settings and fills with `wrong`, which shows "Wrong password.", and nothing returns for Bea.
  - Filling with `LAKE_PASSWORD` shows "Lake filled." and Bea sees `Seed: from the lake` within 5 s.
  - Changing the lake password: current and new, then fill with the old password fails and the new one works. The global reset restores the seed for later runs.
- [ ] **`statuses.spec.ts`:**
  - Bea creates "Raiding" with `#ff66aa` and selects it. Alice sees "Raiding" next to Bea's name.
  - Alice edits its colour, and Bea's picker shows the new colour live.
  - Alice deletes it, and Bea's custom status is cleared while her status message stays.
- [ ] **`media.spec.ts`:**
  - Files with the extension `pmp`, `.pmp` and `PMP` → exactly one row, `raid.PMP`.
  - Links shows `example.com`.
  - After Drag the Lake, the gallery shows no seeded media. After Fill, it is back.
  - "Both" versus "This space" counts differ once Schist has an image. Stub the upload to post an image in Schist via `serviceClient` as Bea's insert.
- [ ] **`compat.spec.ts`:** simulate a cached old app.
  - Insert a message as Bea through an **authenticated** supabase-js client (Bea's password) with **only `channel_id`** (the general channel) and `session_id`, the way the old `MessageInput` did. It appears live in Alice's Main within 5 s, through the `postgres_changes` safety net.
  - Call `rpc('change_sheets', { p_channel_id: general })` as Bea. Alice's spaces clear.
- [ ] `npm run db:reset && npm run e2e` is all green on both projects. Run the new specs 3 times (`--repeat-each=3`) to check for flakiness.
- [ ] Commit: `Add two-user e2e for spaces, lake, statuses, media and old-app compatibility`

### Task 18: CI and docs

**Files:** `.github/workflows/ci.yml`, `SETUP.md`, `docs/testing/release-rehearsal.md`, `docs/plans/2026-10-18-rework-roadmap.md`

- [ ] **CI:**
  - `on.push.branches: [main]` (stops the duplicate runs on PR branches); `pull_request` is unchanged.
  - In the `e2e` job, after `db:start`: `npm run test:db`, then `npm run test:migration`. The migration test ends with a reset, which re-applies the seed, so `E2E_SKIP_RESET=1` stays valid.
- [ ] **`SETUP.md`:** add `test:db` and `test:migration` to the Testing table. The seeded accounts are now Alice, Bea and **Cleo (not a member)**, with lake password `test-lake-password`.
- [ ] **`docs/testing/release-rehearsal.md`.** The user runs this before the eventual production release, after sub-project 3:
  1. Record the production counts with the pre-release query from the brainstorm: per-channel messages, sessions and users.
  2. Run `pg_dump --data-only --schema=public --schema=auth -Fc "$PROD_DB_URL" > prod.dump` **in your own terminal**. The password stays with you.
  3. `npm run db:stop && npm run db:start`, then `npx --yes supabase@2 db reset --version 20261019080218 --no-seed`.
  4. `pg_restore --data-only --disable-triggers -d postgresql://postgres:postgres@127.0.0.1:54322/postgres prod.dump`
  5. `npx --yes supabase@2 migration up --local`. Any count assertion failure aborts with a message.
  6. Compare: messages per space equal general (Main) plus the extra channels, and schist (Schist); sessions and visibility are unchanged; PINs verify (sign in, lock, unlock).
  7. `npx --yes supabase@2 db push --dry-run`, then a real push only when it is confirmed.
  8. Delete `prod.dump`.
  9. Deploy the app. After **both** phones show the new app, schedule the contract migration.
- [ ] **Roadmap:** mark sub-project 2 as built and link the spec and plan. Add the contract checklist from the spec, and add "Seen marker + status pill + Main|Schist toggle design" to sub-project 3.
- [ ] Commit: `Run database and migration tests in CI; document the release rehearsal`

---

## Known open issues (accepted for this sub-project)

- **Plain-text `lock_pin`** stays readable by members until contract, because old apps check it locally. The hash path is the only one the new app uses.
- **`lock_pin_length`** is visible to other members, which reveals PIN length only. Accepted.
- **Reaction delete events under RLS** carry only the primary key, so `MessageItem`'s filtered DELETE subscription can miss them. Reactions are redesigned in sub-project 3. This is noted in the roadmap.
- **There is no attempt limit** on `verify_pin`/`fill_the_lake`. With two users and bcrypt, this is accepted; it can be revisited.

## Testing summary

| Layer | Command | New in this plan |
|---|---|---|
| Database (pgTAP) | `npm run test:db` | Schema, compatibility, RLS (incl. a non-member), receipts matrix, media, RPCs |
| Migration | `npm run test:migration` | Old-shape multi-channel history → exact counts, idempotent re-run |
| Unit | `npm test` | spaces/status helpers, read scheduler, stores, LakeSettings, media gallery |
| E2E | `npm run e2e` | spaces/unread/cross-device, lake drag/fill/password, statuses, media filters, old-app compatibility |

## Final verification

```bash
npm run db:reset
npx tsc -b && npm run lint && npm test
npm run test:db
npm run test:migration
npm run e2e
npm run build && docker compose build
git status   # clean
```
All green, and nothing pushed to any remote or to the hosted Supabase project.
