# Sub-project 1: Test Foundation and PIN Pad — Design

**Date:** 2026-10-18
**Status:** Approved in brainstorm, pending spec review
**Roadmap:** `2026-10-18-rework-roadmap.md`

## Problem

The app has no automated tests. Regressions keep reaching use, for example "after a PIN unlock, typed messages don't send" and "new messages sometimes don't appear". The upcoming rework (conversations data model, Messenger-style UX) is large, so it needs a safety net that can verify **two people talking in real time**, on desktop and on iPhone-sized WebKit. That net doesn't exist today.

The schema files have also drifted. Changes were pasted into the Supabase SQL editor by hand, and `pinned_messages.sql` isn't even numbered. The repo's migrations therefore can't be trusted to recreate production, which blocks running a local database.

The PIN pad drops digits when tapped quickly and doesn't feel like iOS.

## Goals

1. A local Supabase stack, in Docker, built from an exact copy of the production schema.
2. Unit and component tests (Vitest).
3. Two-user end-to-end tests (Playwright) over real Realtime, on desktop Chromium and iPhone-sized WebKit.
4. CI on every push and PR (GitHub Actions) running all of the above.
5. An iPhone-style PIN pad (4–6 digits) that is reliable under fast input, built test-first.
6. A regression test, and then the fix, for "can't send after PIN unlock".

## Non-goals

- Heavy end-to-end coverage of the current Discord-style UI, which is being replaced in sub-project 3.
- Hashing the PIN (sub-project 2).
- Running edge functions locally or in CI.
- Changing the Eep veneer.

## Approach

A real local Supabase (`supabase start`), Vitest with React Testing Library for units and components, and Playwright with two separate browser sessions per test for end-to-end runs. Approaches rejected: mocking Supabase with MSW (can't verify Realtime between two users) and Cypress (can't run two independent users in one test, and its WebKit support is weak).

---

## 1. Baseline schema and the local stack

### Supabase command-line tool
- Add `supabase` to devDependencies. All commands run through `npx supabase …`.
- `npx supabase init` creates `supabase/config.toml` with the default ports: API 54321, DB 54322, Studio 54323.
- **Manual step (the user does this; it needs the database password):**
  1. `npx supabase link --project-ref <ref>`
  2. `npx supabase db pull`, which writes `supabase/migrations/<timestamp>_remote_schema.sql`.
- Move `00001`–`00011` and `pinned_messages.sql` to `supabase/migrations_archive/` (reference only; the CLI ignores that folder).
- Check that the pulled schema includes: the `change_sheets` and `get_channel_messages` RPCs, the RLS policies, the `supabase_realtime` publication membership (messages, reactions, pinned_messages, and whatever else production has), `reactions` replica identity full, and the `profiles_status_check` values.
- From now on, every schema change is a new timestamped migration applied with `npx supabase db push`. Update `SETUP.md` to say so.

### Seed data: `supabase/seed.sql`
Applied by `supabase db reset`, locally and in CI only. It is never pushed to production.
- Users, inserted directly into `auth.users` and `auth.identities` with `crypt()` passwords (the standard Supabase seed pattern). The existing `handle_new_user` trigger creates their profiles.
  - `alice@test.local` / `password123`, nickname "Alice", PIN `1234`
  - `bea@test.local` / `password123`, nickname "Bea", PIN `567890` (6 digits, so both lengths are covered)
- One `general` channel with one visible session and a few messages, one reaction, and one pin.
- Two custom emoji pointing at fixture URLs.
- `settings.eep_passphrase` = `test-passphrase`.
- Fixed UUIDs for everything, so tests can refer to them.

### Environment and scripts
- `.env.test` (committed): `VITE_SUPABASE_URL=http://127.0.0.1:54321`, the local anon key (a public, fixed value used only in local development), and `VITE_BUNNY_CDN_URL=http://cdn.test.local`.
- `package.json` scripts:
  - `db:start`: `supabase start`
  - `db:stop`: `supabase stop`
  - `db:reset`: `supabase db reset`
  - `test`: `vitest run`
  - `test:watch`: `vitest`
  - `e2e`: `playwright test`
  - `e2e:ui`: `playwright test --ui`
  - `dev:test`: `vite --mode test`

### Outside services
Edge functions are only called from the browser, so Playwright intercepts:
- `**/functions/v1/gif-search*` → `e2e/fixtures/gifs.json`
- `**/functions/v1/upload-media*` → a fixed success response pointing at a fixture URL
- `http://cdn.test.local/**` → files from `e2e/fixtures/media/`

No Klipy or Bunny keys are needed locally or in CI.

---

## 2. Unit and component tests, and the PIN pad

### Vitest setup
- `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`.
- Configured in `vite.config.ts` (`test:` block): environment `jsdom`, setup file `src/test/setup.ts`. The `@` path alias is shared with the app.
- Tests sit next to the code they test: `Foo.test.tsx` beside `Foo.tsx`. Shared helpers live in `src/test/`.
- In unit tests the Supabase client is mocked at the module level (`vi.mock('@/lib/supabase')`). Real Supabase is used only in end-to-end tests.

### The PIN pad (rebuild)

**Interface**
```ts
interface PinPadProps {
  mode: 'unlock' | 'set'
  length?: 4 | 5 | 6                   // required for 'unlock'
  verify?: (pin: string) => Promise<boolean>  // 'unlock' mode
  onSuccess: (pin: string) => void     // 'set' returns the confirmed PIN
  onCancel?: () => void
}
```
The PIN pad never compares PINs itself. In unlock mode it calls `verify`. Today `verify` compares against the loaded `pinCode`; in sub-project 2 it becomes a server-side RPC, with no change to the PIN pad.

**Layout and appearance (modelled on the iOS lock screen)**
- Full-screen overlay on a heavily blurred, darkened backdrop of the Eep page (`backdrop-filter: blur(...)`).
- Small lock glyph above "Enter Passcode" ("Enter New Passcode" / "Confirm New Passcode" in set mode).
- One dot per digit: an empty ring that fills on the same frame as the tap.
- 3×4 keypad of large frosted-glass circles, about 78 px. Each key shows its digit with the letters underneath (2 ABC, 3 DEF, 4 GHI, 5 JKL, 6 MNO, 7 PQRS, 8 TUV, 9 WXYZ). A pressed key flashes lighter.
- Bottom row: empty, `0`, then a text button that reads **Cancel** when nothing is entered (shown only if `onCancel` is given) and **Delete** once a digit is in.
- **Wrong PIN:** the dots do the iOS horizontal shake (about 400 ms, damped), then clear. No vibration, because Safari doesn't support it.
- **Correct PIN:** the overlay fades and scales up slightly (about 250 ms) before `onSuccess`.
- Respects `prefers-reduced-motion`: animations are replaced by an instant state change.

**Set mode**
- Starts at 6 digits, with a **"Passcode Options"** link to choose 4, 5 or 6.
- Enter, then confirm. If the two don't match: shake, "Passcodes did not match. Try again.", and back to the enter step.

**Fast-input reliability**
- Keys respond on `pointerdown` (not `click`), call `preventDefault`, and use `touch-action: manipulation`. This removes the tap delay and double-tap zoom.
- Each tap adds to the PIN through a functional state update. In addition, a `useRef` buffer is the source of truth for completion checks, so no tap is lost or counted twice between screen updates.
- When the buffer reaches `length`, input is **locked** (`status: 'verifying'`). Further taps are ignored until verification settles. On failure, input unlocks only after the shake finishes and the buffer clears.
- `verify` / `onSuccess` are called directly with the buffer contents, never through a timeout reading component state.
- On desktop: `0`–`9`, `Backspace` and `Escape` (= Cancel) are handled through a `keydown` listener on the window while the PIN pad is mounted.
- `user-select: none`, `-webkit-touch-callout: none`, key touch area larger than the visible circle.

**PIN length source (until sub-project 2)**
- In `uiStore`: `pinLength = pinCode?.length`.
- The Settings "set PIN" flow switches to the new PIN pad's set mode and accepts lengths 4–6.

### Unit tests in this sub-project
- `PinPad.test.tsx`, run for each of lengths 4, 5 and 6:
  - Shows one dot per digit.
  - Fast entry (all digits in one synchronous batch) → `verify` called once with the right PIN.
  - Delete removes the last digit. The button label switches between Cancel and Delete.
  - Wrong PIN → error state → buffer clears → a correct retry succeeds.
  - Taps after the last digit are ignored while verifying.
  - Keyboard input works on desktop.
  - Set mode: mismatched confirmation shows the error and restarts; a matching one calls `onSuccess` with the PIN.
- `uiStore.test.ts`: `lockApp` / `unlockPin` / `setEepMode` change state correctly, and `sessionStorage` / `document.title` are updated.
- `markdown.test.ts`: bold, italic, strikethrough, code, code blocks, spoilers, quotes. (`:emoji:` tokens aren't parsed by `lib/markdown.ts` today; that work is in sub-project 3.)

---

## 3. Two-user end-to-end tests and CI

### Playwright setup (`playwright.config.ts`)
- `webServer`: `npm run dev:test` on port 5174, reusing an existing server locally.
- Browser setups:
  - `chromium-desktop`: Desktop Chrome, 1280×800.
  - `webkit-iphone`: `devices['iPhone 15']` (WebKit, touch, mobile user agent).
- `workers: 1` and `fullyParallel: false`, because all tests share one database (revisit in sub-project 3).
- `retries: 2` in CI, 0 locally. `trace: 'retain-on-failure'`, `video: 'retain-on-failure'`.
- Global setup: `supabase db reset` (skipped when `E2E_SKIP_RESET=1`), then log Alice and Bea in through the UI and save `e2e/.auth/alice.json` and `e2e/.auth/bea.json` (gitignored).

### Test helpers (`e2e/fixtures.ts`)
- `alice`, `bea`: each wraps a **separate browser session** loaded with that user's saved sign-in, plus page objects:
  - `composer` (`type`, `send`), `messageList` (`last`, `scrolledToBottom()`), `typingIndicator`
  - `eep` (`enterPassphrase`), `pinPad` (`enter(pin)`)
  - `background()` / `foreground()`: set `document.visibilityState` and dispatch `visibilitychange`, `pagehide` and `pageshow` the way iOS orders them.
- `secondDevice(user)`: opens another session for the same user (needed by the multi-device presence tests in sub-project 3).
- Network interception for the outside services is installed on every session automatically.
- Use role- and label-based locators. Add a `data-testid` only where no accessible name exists.

### Tests in this sub-project (`e2e/`)
1. `auth.spec.ts`: logged out shows the Eep page; Login → credentials → chat is visible.
2. `eep.spec.ts`: from the chat, the `/eep` command shows the Eep page; entering the passphrase returns to the chat.
3. `pin-lock.spec.ts`:
   - Background → foreground → Eep page shown → tap the hidden "Unlock" dot → PIN pad; wrong PIN shakes and clears; correct PIN opens the chat. (Current behaviour: going to the background only sets `eepMode`; `lockApp()`/`pinLocked` exists but is never called. This is documented, not changed, because it is part of the veneer.)
   - **Regression:** after unlocking, Alice types and sends; Bea receives the message; Alice's message box is empty and still usable.
   - Fast entry: all digits tapped within about 100 ms → unlocks.
4. `messaging.spec.ts`: Alice sends → Bea sees it live; Bea replies → Alice sees it live.
   - **Known bug, fixed in this sub-project:** `broadcastNewMessage` (`src/hooks/useMessages.ts`) is never called, so the other person only sees a new message after their list reloads. Write this test first, watch it fail, then make the smallest fix: `MessageInput` broadcasts the inserted row on the `channel:<id>` channel. The full redesign of message delivery is in sub-project 3.

### The "can't send after PIN unlock" bug
1. Write `pin-lock.spec.ts` (regression) first and confirm it fails (on either browser setup).
2. Investigate with the jig `debug` skill. Also remove or wire up the unused `lockApp`/`pinLocked` path only if the root cause points there. Likely suspects: stale state in the chat screen while it is hidden with `display:none`, the `pinLocked`/`eepMode` change order in `EepMode.handlePinComplete`, or the Realtime subscription or session lookup going stale while hidden.
3. Fix the root cause; the test passes on both browser setups.

If it doesn't reproduce in emulation, record that in the iPhone checklist and keep the test as a guard.

### CI (`.github/workflows/ci.yml`)
Triggers: push to any branch, and pull requests to `main`.

- **Job `check`** (ubuntu-latest, Node 20): `npm ci` → `npm run lint` → `npx tsc -b` → `npm test`.
- **Job `e2e`** (needs `check`):
  - `npm ci`
  - Cache `~/.cache/ms-playwright`; `npx playwright install --with-deps chromium webkit`
  - `npx supabase start -x studio,imgproxy,inbucket,edge-runtime,logflare,vector,supavisor` (only what the tests need)
  - `npx supabase db reset`
  - `npm run e2e`
  - On failure: upload `playwright-report/` and `test-results/` as artifacts (7-day retention).
- Expected run time: about 1 minute for `check` and 5–7 minutes for `e2e`.

### Manual iPhone checklist: `docs/testing/iphone-checklist.md`
Run on a real iPhone (installed home-screen app) at the end of each milestone:
- App-switcher snapshot doesn't show chat content (expected to fail as a PWA; tracked by sub-project 4).
- Returning from the background shows the Eep page; the "Unlock" dot opens the PIN pad, which unlocks.
- Fast thumb entry on the PIN pad registers every digit.
- Autocorrect, predictive text and autocapitalise work in the message box.
- The keyboard doesn't cover the message box; the message list stays at the bottom when the keyboard opens.
- A new message from the other person appears without a refresh after the app was in the background.
- Safe areas are respected (notch, home indicator).
- Double-tap doesn't zoom; long-press doesn't select UI text.
- Images and video play inline.
- Typing indicator and presence update within about 2 s.

---

## Error handling

- **Test setup:** global setup fails fast with a clear message if Supabase isn't running ("Run `npm run db:start` first") or the seeded users can't log in.
- **PIN pad:** if `verify` rejects (a network error, once the check moves to the server), it is treated as a failed attempt but with a different message ("Couldn't verify. Try again."), and input unlocks. It never leaves the PIN pad locked.
- **CI:** traces, videos and screenshots are uploaded on failure, so failures can be diagnosed without re-running locally.

## Security

- The local anon key and seed passwords are fixed values used only in local development; committing `.env.test` and `seed.sql` is safe. The seed never reaches production, because `db push` applies migrations only.
- `e2e/.auth/` (saved sign-ins) is gitignored.
- `supabase db pull` writes schema only, with no row data. Check the pulled file for any embedded secrets before committing.
- Known issues deferred: the plain-text `lock_pin` readable by every signed-in user (sub-project 2) and the Eep passphrase in git history (rotate on production).

## Test strategy (summary)

| Layer | Tool | Scope | Where |
|---|---|---|---|
| Unit / component | Vitest + RTL | PIN pad, uiStore, markdown | local + CI |
| End-to-end, two users | Playwright (Chromium desktop, WebKit iPhone) | Eep, PIN lock, basic messaging | local + CI |
| Manual device | iPhone checklist | iOS-only behaviour | each milestone |

Policy from here on: every bug fix starts with a failing test at the lowest layer that can reproduce it.

## Concerns checklist

No `jig.config.md`, so the defaults were used.

| Concern | Applies | Notes |
|---|---|---|
| Error handling | Yes | Setup fails fast; PIN `verify` failures never leave the PIN pad locked; CI keeps traces on failure. |
| Security | Yes | Only local values are committed; saved sign-ins are gitignored; the pulled schema is checked for secrets; PIN hashing and passphrase rotation are deferred and tracked in the roadmap. |
| Test strategy | Yes | This sub-project *is* the test strategy (see above). |

## Deliverables

- `supabase/config.toml`, `supabase/migrations/<ts>_remote_schema.sql`, `supabase/migrations_archive/`, `supabase/seed.sql`
- `.env.test`, updated `package.json`, updated `vite.config.ts`, `src/test/setup.ts`
- Rebuilt `src/components/pin/PinPad.tsx` (+ tests); callers in `EepMode.tsx` and `UserSettings.tsx` updated to the new interface
- `src/stores/uiStore.test.ts`, `src/lib/markdown.test.ts`
- `playwright.config.ts`, `e2e/` (fixtures, global setup, 4 spec files)
- Fix for "can't send after PIN unlock" (root cause found through the regression test)
- `.github/workflows/ci.yml`
- `docs/testing/iphone-checklist.md`, updated `SETUP.md` (migration workflow, test commands)

## Changes from the plan review (2026-10-19)

The plan review surfaced these changes. They're now part of this sub-project:
- **Single layout:** on phones, `AppShell` mounted both the desktop and mobile chat trees. The hidden desktop copy shared and tore down the realtime channel, which broke live delivery on iPhone. The fix is a `useMediaQuery` hook, so exactly one tree mounts.
- **PIN pad can't get stuck:**
  - A failed save keeps the pad open with "Couldn't save. Try again."
  - Cancel and Escape are ignored while a PIN is being verified.
  - A late verify result after the pad closes is ignored.
  - The unlock length is the stored PIN's real length, so legacy PINs still work.
  - `setPinCode` now throws on failure.
  - PIN state is cleared on logout.
- **Realtime status** belongs to the current subscription. It resets when the channel changes, ignores stale callbacks, and backfills messages on a re-join. The full reconnect UX is in sub-project 3.
- **Live-delivery fix** covers both text and GIF sends. The unused `messageStore.sendMessage` is deleted.
- **Supabase CLI** runs through `npx --yes supabase@2`, not as a dependency, so it stays out of the Docker image.
- **New `.dockerignore`.** `tsconfig.e2e.json` brings the e2e code into `tsc -b`. ESLint uses Node globals for e2e and turns off the React-hooks rules there.
- **Production safety:**
  - The signup-trigger migration is written only if it matches what production has.
  - The realtime publication migration checks each table exists before adding it.
  - The migration history is checked with `migration list`.
  - No task pushes. Pushing is a user step that starts with `db push --dry-run`.

## Open questions

None blocking. The only manual dependency is the user running `supabase link` and `db pull`. Until then, implementation can start on Vitest and the PIN pad, which don't need the database.
