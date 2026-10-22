# Setup Guide

Complete instructions for setting up and running the chat system locally and in production.

## Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) account (free tier works)
- A [bunny.net](https://bunny.net) account with a Storage Zone and Pull Zone
- A [Klipy API key](https://partner.klipy.com) (free — sign up, add a platform, and copy your key)
- (For deployment) A DigitalOcean account and Docker installed

---

## 1. Supabase Setup

### Create a project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Note your **Project URL** and **Publishable key** from Settings > API (previously called the "anon public key" — same thing, just renamed)

### Database migrations

The schema is managed with the Supabase CLI. It isn't installed as a dependency; run it with `npx --yes supabase@2`.
`supabase/migrations/` holds a baseline pulled from production (`*_remote_schema.sql`) plus any later timestamped migrations.
The old hand-applied SQL files are kept in `supabase/migrations_archive/` for reference only.

- **New project:** `npx --yes supabase@2 link --project-ref <ref>`, then push (see below), then insert your
  `eep_passphrase` row into `settings` from the SQL editor (no secrets live in migrations).
- **Schema change:** `npx --yes supabase@2 migration new <name>`, write the SQL, test it locally with
  `npm run db:reset`, then push. Never paste schema changes into the SQL editor:
  the repo and production drift apart.
- **Pushing to production:** always run `npx --yes supabase@2 db push --dry-run` first and read the list of
  pending migrations. Push only after you've reviewed each one. `npx --yes supabase@2 migration list` shows
  what is applied locally and remotely.

### Configure Auth

1. Go to Authentication > Providers
2. Ensure **Email** provider is enabled
3. Optionally disable "Confirm email" for easier dev testing (Authentication > Settings)

### Enable Realtime

1. Go to **Database > Publications**
2. Click on **supabase_realtime**
3. Toggle on `messages`, `reactions`, `profiles`, and `pinned_messages`

(For new projects pushed from the baseline migration this is already done: the baseline includes the publication membership.)

### Deploy Edge Functions

Install the Supabase CLI if you haven't:

```bash
npm install -g supabase
```

Link your project and deploy:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy upload-media
supabase functions deploy gif-search
```

Set the required secrets for the Edge Functions:

```bash
supabase secrets set BUNNY_API_KEY=your-storage-zone-password
supabase secrets set BUNNY_STORAGE_ZONE=your-storage-zone-name
supabase secrets set BUNNY_STORAGE_HOST=your-region-hostname  # e.g. storage.bunnycdn.com, uk.storage.bunnycdn.com, de.storage.bunnycdn.com
supabase secrets set BUNNY_CDN_URL=https://your-pullzone.b-cdn.net
supabase secrets set KLIPY_API_KEY=your-klipy-api-key
```

---

## 2. bunny.net Setup

1. Log into [bunny.net](https://bunny.net)
2. Create a **Storage Zone** (e.g., `chat-media`)
3. Create a **Pull Zone** linked to that Storage Zone
4. Note your:
   - **Storage Zone Password** (Storage Zone > FTP & API Access > **Password** — this is NOT your account API key, it's specific to the storage zone)
   - **Storage Zone name** (the name you chose)
   - **FTP Hostname** (Storage Zone > FTP & API Access > **FTP Hostname** — region-specific, e.g. `storage.bunnycdn.com`, `uk.storage.bunnycdn.com`, `de.storage.bunnycdn.com`)
   - **Pull Zone URL** (e.g., `https://chat-media.b-cdn.net`)

---

## 3. Local Development

### Install dependencies

```bash
npm install
```

### Configure environment

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

Edit `.env`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_BUNNY_CDN_URL=https://your-pullzone.b-cdn.net
```

### Start the dev server

```bash
npm run dev
```

The app will be available at `http://localhost:5173`.

### iOS app (local)

The iPhone app is the same web code wrapped in Capacitor (`ios/`, `capacitor.config.ts`). Getting it onto real phones: [docs/ios/testflight-runbook.md](docs/ios/testflight-runbook.md).

1. Install Xcode (with an iOS simulator) and run it once to accept the licence.
2. Create `.env.native.local` (git-ignored) for the app's web build. For the local stack, copy the `.env.test` values and add `VITE_NATIVE_UPDATE_URL=http://localhost:8080` (the Docker image, for trying live updates; leave it out to turn them off).
3. With the local stack running (`npm run db:start`), run `npm run ios:sim` (or `npm run ios:sim -- "iPhone 16"`). It builds the web code with `--mode native`, copies it into `ios/`, builds the app and opens it in the simulator.
4. Web Inspector: Safari → Develop → Simulator → XIV.
5. After changing the FF14 picker screen or `public/icon.svg`, run `npm run ios:assets` (it needs the e2e stack, see its header comment) to regenerate the app icon and the Splash image, which is both the launch screen and the app-switcher cover.

The native checks are the "Native app" rows of [docs/testing/iphone-checklist.md](docs/testing/iphone-checklist.md).

### Register users

1. Open the app and click "Register"
2. Create two accounts (one for each person)
3. Log in with either account to start chatting

---

## 4. Customization

### Change the Eep! passphrase

The default passphrase is `the_epic_of_alexander`. To change it:

1. Go to the Supabase Dashboard > Table Editor > `settings`
2. Find the row with key `eep_passphrase`
3. Update the `value` column to your desired passphrase

### Restore archived channels

1. Go to Supabase Dashboard > Table Editor > `channels`
2. Find the archived channel and set `archived` to `false`

### Restore hidden sessions (after Change the Sheets)

1. Go to Supabase Dashboard > Table Editor > `sessions`
2. Find the session(s) you want to restore and set `visible` to `true`
3. Note: making a session visible again will cause its messages to reappear in chronological order

---

## 5. Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+E` | Activate Eep! mode |
| `Escape` (double-tap) | Activate Eep! mode |
| `Enter` | Send message |
| `Shift+Enter` | New line in message |
| `Escape` (while editing) | Cancel edit |

## 6. Slash Commands

| Command | Action |
|---------|--------|
| `/sheets` | Change the Sheets (wipe visible chat in current channel) |
| `/eep` | Activate Eep! mode |

---

## Testing

Requires Docker.

| Command | What it does |
|---|---|
| `npm run db:start` | Start local Supabase (Postgres, Auth, Realtime) and apply migrations + `supabase/seed.sql`. Edge functions aren't started; tests stub them. |
| `npm run db:reset` | Rebuild the local database from migrations + seed |
| `npm run db:stop` | Stop local Supabase |
| `npm test` | Unit/component tests (Vitest) |
| `npm run test:db` | Database tests (pgTAP, `supabase/tests/database`): schema, old-app compatibility, RLS, read receipts, media, RPCs. Each file runs in a rolled-back transaction, so it works on a database the e2e suite has used. |
| `npm run test:migration` | Migration test: loads old-shape, multi-channel history onto the baseline schema, applies the conversations migrations, checks exact counts and that re-running them changes nothing. Ends with `db:reset`. |
| `npm run e2e` | Two-user end-to-end tests (Playwright: desktop Chromium + iPhone WebKit). Resets the DB first; set `E2E_SKIP_RESET=1` to skip. The theme screenshot projects are included but skip outside Linux (see below). |
| `npm run e2e:ui` | Playwright UI mode for debugging |

Seeded accounts (password `password123` for all):

| Account | Nickname | PIN | Notes |
|---|---|---|---|
| `alice@test.local` | Alice | `1234` | Member of the conversation |
| `bea@test.local` | Bea | `567890` | Member of the conversation |
| `cleo@test.local` | Cleo | none | **Not a member** of any conversation (for RLS tests) |

Eep passphrase `test-passphrase`, lake password `test-lake-password`. These are local-only values.

CI (`.github/workflows/ci.yml`) runs lint, type-check and unit tests, then the database tests, the migration
test, the e2e suite and the theme screenshots, on pull requests to `main` and pushes to `main`.

### Screenshot baselines

`e2e/themes.spec.ts` takes a screenshot of the chat in each of the 11 themes, in two projects:
`screenshots-desktop` (1280×800) and `screenshots-phone` (393×852, touch, coarse pointer). Times, date
chips, presence and the typing bubble are masked. The tests run **only on Linux**, because fonts render
differently on macOS; locally they show as skipped. The baselines are rendered by CI on `ubuntu-24.04`
(pinned in the workflow, so a runner image change doesn't break every comparison).

- **First run (no baselines committed):** CI's "Theme screenshots" step runs with
  `--update-snapshots=missing`, so it writes every missing baseline and passes. The step after it uploads
  the `*-snapshots` folders as the `screenshot-baselines` artifact on every run.
- **Commit them:** download that artifact from the workflow run and unzip it into the repo so the files land
  in `e2e/themes.spec.ts-snapshots/` (named like `sakura-screenshots-phone-linux.png`). Look through them, then
  commit.
- **Later runs** compare against the committed baselines; a visual change fails the step, and the report
  (`screenshot-report` artifact) shows the diff.
- **Intentional change** (a theme or layout tweak): delete the affected `.png` files, push, and commit the
  new ones from that run's artifact. Or, on a Linux machine with the local stack running:
  `npx playwright test --project=screenshots-desktop --project=screenshots-phone --update-snapshots=all`.
  The run resets the database first, so the seeded history is the same each time.

Bug-fix policy: every fix starts with a failing test at the lowest layer that can reproduce it.
Before each milestone, run `docs/testing/iphone-checklist.md` on a real device.
