# Release checklist: your part

Everything in the rework that only **you** can do: things that touch production Supabase, the DigitalOcean droplet, GitHub merges and Apple. Claude never does these. It prepares the code and the commands, and you run them.

Work top to bottom. Each section says when it can start. Tick items as you go. A **Why** line explains anything that isn't obvious.

Related docs:
- The same list as a tickable page: https://claude.ai/artifact/DZR4EbHaYJPc8sFi53t2Pw (private; open it from your claude.ai account).
- [release-rehearsal.md](../testing/release-rehearsal.md): the full rehearsal steps (section C below links into it).
- [DEPLOY.md](../../DEPLOY.md): the droplet.
- [testflight-runbook.md](../ios/testflight-runbook.md): Apple and TestFlight.

**Ground rules**
- Never paste the production database password, the service-role key or the Bunny and Klipy keys into a chat, an issue or a file in the repo. Set them in your terminal for the one command that needs them.
- Run anything that **writes** to production once, deliberately, after its dry run looks right. Those items are marked ⚠️.

---

## A. Now: merge the finished work (GitHub)

- [x] **PR #4 (redesign 3b) and PR #5 (the iOS app): merged**.
- [ ] **The voice memos PR: merge once Claude opens it and CI is green** (sub-project 5).
  - Claude first commits the regenerated theme screenshots from its CI run (the voice bubble and the mic in the empty message box change them).

Nothing in section A changes production. `main` is only deployed when you deploy it (section D).

---

## B. Before release day: one-time checks (Supabase dashboard and your Mac)

- [ ] **Log in to the Supabase CLI** on your Mac: `npx --yes supabase@2 login`, then `npx --yes supabase@2 link --project-ref <your project ref>`.
  - The project ref is the `xxxx` in `https://xxxx.supabase.co`.
  - `link` asks for the database password. Type it there, nowhere else.
- [ ] **Check production's migration history**: `npx --yes supabase@2 migration list`.
  - Expected: `20261019080218` (the baseline) shows as applied on **both** Local and Remote, and every later migration shows as Local only.
  - If the baseline shows Local only, run `npx --yes supabase@2 migration repair --status applied 20261019080218`.
  - *Why:* the baseline *is* production's current schema, pulled from it. If production's history doesn't list it, `db push` would try to create every existing table again and fail. `repair` only writes the history row; it changes no tables or data.
- [ ] **Install Postgres client tools** matching production's major version (Dashboard → Project Settings → Infrastructure shows it), e.g. `brew install postgresql@17`, so `pg_dump` and `pg_restore` work.
- [ ] **Realtime settings** (Dashboard → Realtime → Settings): leave **public channel access allowed**.
  - *Why:* the new chat's conversation channel is private and protected by policies that the migrations add. Presence and the old app still use public channels, so turning public access off would break presence.
- [ ] **Edge function secrets are unchanged** (Dashboard → Edge Functions → Secrets): `BUNNY_API_KEY`, `BUNNY_CDN_URL`, `BUNNY_STORAGE_ZONE`, `KLIPY_API_KEY` (and optionally `BUNNY_STORAGE_HOST`). Nothing to add.
  - *Why:* the secrets don't change. `gif-search` is unchanged; `upload-media` changes once, for voice memos (it accepts audio files), and section D deploys it.
- [ ] **Know the Fill the Lake password after release.**
  - The migration stores a hash of the agreed starting value (not the old plain-text setting).
  - After release, Fill the Lake accepts that agreed word.
  - *Why:* the plain word is deliberately not in the repo, so only you know it. If you've forgotten it, tell Claude before release and a fresh hash goes into the migration.

---

## C. The release rehearsal (your Mac, against a local copy of production)

Full steps: [release-rehearsal.md](../testing/release-rehearsal.md). Start once everything in section A is merged. Claude runs the local parts with you. You run the two steps that read production.

- [ ] **Step 1: record production's counts** (Dashboard → SQL editor; read-only queries are in the doc). Save the output with the date.
- [ ] **Step 2: dump production's data** in your terminal (`pg_dump … > prod.dump`).
  - The dump includes `auth` (password hashes), so keep it out of the repo folder and delete it in step 8.
- [ ] **Steps 3–6 (with Claude):** rebuild the local database at the baseline, load the dump, apply the migrations, and compare counts.
  - Also sign in with your **real** account locally and unlock with your **real PIN**. Record and play a voice memo too.
  - *Why:* this proves the PIN hashing and the channel merge work on your actual data, not only on test data.
- [ ] **Step 8: delete `prod.dump`.**

The rehearsal stops before step 7 (the push). That step is section D.

---

## D. Release day (production)

Pick a quiet time; the whole thing takes about 30 minutes. Keep both phones and the Mac nearby.

**Supabase**
- [ ] **Take a full backup first** (schema and data), in your terminal:
  ```bash
  pg_dump -Fc "$PROD_DB_URL" > prod-before-release-$(date +%Y%m%d).dump
  ```
  Keep it somewhere safe outside the repo until the contract migration is done (section F).
  - *Why:* the free plan has no point-in-time restore. This file is the way back if something goes badly wrong.
- [ ] **Dry run:** `npx --yes supabase@2 db push --dry-run`. It must list exactly these, in this order, and nothing else:
  - `20261019120000_conversations_schema`
  - `20261019120100_conversations_backfill`
  - `20261019120200_conversations_compat`
  - `20261019120300_conversations_rls`
  - `20261019120400_message_media`
  - `20261019120500_conversations_rpcs`
  - `20261020090000_attachment_spoiler`
  - `20261020090100_message_replies`
  - `20261020090200_profile_presence`
  - `20261020120000_custom_emoji_live`
  - `20261026090000_voice_memos`
- [ ] ⚠️ **Push:** `npx --yes supabase@2 db push`.
  - *Why it's safe for the running site:* these migrations only **add** (the "expand" step). The old app, still live on the droplet and cached on the phones, keeps working against the new schema through compatibility triggers. Nothing is dropped until section F.
  - If the backfill finds a count mismatch, it aborts and nothing is applied. Stop and tell Claude.
- [ ] ⚠️ **Deploy `upload-media`:** `npx --yes supabase@2 functions deploy upload-media`.
  - *Why:* voice memos upload `.m4a` and `.webm` files, which the deployed function refuses. The new version only adds those two types (and only into the `voice/` folder), so the old app keeps working with it. Deploy it before the website, so the first memo from the new app can upload.
- [ ] **Re-run the step 1 queries** from the rehearsal and check the counts match what you recorded.

**Droplet**
- [ ] **Add the new setting** to `/opt/chat-system/.env` on the droplet:
  ```env
  VITE_NATIVE_UPDATE_URL=https://<your site's address>
  ```
  - *Why:* the iOS app downloads web updates from `https://<your site>/native/`. Without this line the website still works, but the app never updates itself.
- [ ] **Remove `VITE_TENOR_API_KEY`** from `.env` if it's there. It's unused (GIFs moved to Klipy), and harmless if you leave it.
- [ ] **Build the image on your Mac, not on the droplet** (DEPLOY.md, Option B), using the same values as the droplet's `.env`, with `--platform linux/amd64` (the droplet's platform). Then `docker save`, `scp` and `docker load` on the droplet.
  - *Why:* the build now runs Vite twice (the website and the iOS bundle). A 1 GB droplet can run out of memory doing that.
  - If you'd rather keep building on the droplet, first add a 2 GB swap file (`fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile`, plus a line in `/etc/fstab`).
- [ ] ⚠️ **Swap the container.** Stop the old one, then start the new one on the **same port as today**, so Caddy or nginx in front of it needs no change.
  - If you use compose on the droplet: `docker compose up -d`.
  - If you use `docker run`: `docker stop chat-system && docker rm chat-system`, then the `docker run` line from DEPLOY.md with your port.
- [ ] **Check the site:**
  - `https://<site>/` shows the login page, or the FF14 page if you're signed in.
  - `curl -I https://<site>/native/latest.json` returns `200` with `cache-control: no-store`.
  - *Why:* this confirms your reverse proxy passes `/native/` through, and that the iOS bundle step of the build didn't fail. If it failed, the build log says `WARNING` and the site still works.
  - **While the iOS bundle step is switched off** (`docker/Dockerfile`, see DEPLOY.md), this returns `404`; skip it until the step is back on.

**Devices**
- [ ] **Each phone and the Mac:** open the home-screen app or the site, and reload once or twice until the new chat appears.
  - *Why:* the website's service worker updates itself, but the first open may still show the cached old app. That's expected and works, but the old app doesn't receive the new app's live messages, so finish this step on all devices.
- [ ] **Run the quick checks:**
  - Log in, then lock and unlock with each person's PIN.
  - Send in Main and in Schist.
  - Drag the Lake and Fill the Lake (with the agreed word from section B).
  - Add a reaction, add a custom emoji, upload a photo.
  - Presence shows the other person online.
  - Record and send a voice memo from each phone. It plays on the other phone and on the Mac, and the sender's mic turns blue once it's played.
  - Check that the CDN serves memos as audio: in the Supabase dashboard (Table editor → `messages`, newest row), copy the memo's `url` from `attachments`, then run `curl -sI -H 'Range: bytes=0-1' '<url>'`. Expect `HTTP/2 206` and a `content-type` starting with `audio/`. If it says `application/octet-stream`, tell Claude: Safari may refuse to seek.

**If something is badly wrong**
- **Website:** redeploy the previous image. The old app works against the expanded database.
- **Database:** the migrations don't need undoing for the old app to work. Restore the backup only as a last resort, and talk to Claude first: a restore loses anything sent after the backup.

---

## E. The iOS app on both iPhones (Apple; after enrolment)

Any time after section D, because the app talks to the production database. Full steps: [testflight-runbook.md](../ios/testflight-runbook.md).

- [ ] **Enrol** in the Apple Developer Program as an individual ($99/year).
  - Your legal name shows as the developer in TestFlight, visible to your partner.
  - Approval can take a day or two.
- [ ] **Pick the bundle identifier** and tell Claude, who sets it in the project. After the first upload it can't be changed.
- [ ] **Create the App Store Connect record**, then build the app with the production `.env.native.local`, archive and upload (runbook steps 3–5).
- [ ] **Invite your partner** as a team user, add both of you to an internal TestFlight group, and install XIV through the TestFlight app on both phones.
- [ ] **Run the "Native app" rows** (N1–N11) of [the iPhone checklist](../testing/iphone-checklist.md) on both phones.
- [ ] **Once you're both using the app, delete the old home-screen web app** from both phones.
  - *Why:* two copies on one phone would mean two devices in presence, and the web one still has the app-switcher problem.
- [ ] **Calendar reminder: every 80 days**, upload a new build (runbook step 8).
  - *Why:* TestFlight builds stop opening after 90 days.

---

## F. Contract migration (production; after both phones are on the new app)

Start only when **both phones and the Mac** have run the new app (section D's device step, or the iOS app), so nothing still uses the old tables. Allow a few days after release.

- [ ] **Tell Claude you're ready.** Claude writes the contract migration (the roadmap's contract checklist), tests it locally and gives you the dry-run output to expect.
  - The migration drops the old channels and the plain-text `lock_pin` column (the old app read PINs from it).
  - *Why it waits:* a cached old app would break the moment those columns go.
- [ ] **Backup again** (same `pg_dump` command as section D, new file name).
- [ ] **Dry run, then** ⚠️ **`db push`.** It must list only the contract migration.
- [ ] **Quick checks again** (section D's list).
- [ ] **Delete the old backups** (both `prod-before-…dump` files) once you're happy.
  - *Why:* they contain the plain-text PINs and password hashes from before the contract migration.

---

## G. Follow-ups (whenever convenient)

- [ ] **Rotate the Eep passphrase.**
  - *Why:* the current one is in the repo's git history (`supabase/migrations/00007_create_settings.sql`), so anyone who ever sees the repo knows it.
  - How: Claude gives you a one-line SQL update for the dashboard's SQL editor. You choose the new phrase and type it there yourself.
- [ ] **Harden `upload-media`** (allowed folders, an emoji size cap). Claude writes it. You deploy it with `npx --yes supabase@2 functions deploy upload-media`. Apart from the voice memo deploy in section D, this is the only step in this list that deploys an edge function.
- [ ] **Firewall on the droplet**, if not already done: `ufw allow OpenSSH && ufw allow 80,443/tcp && ufw enable`.
