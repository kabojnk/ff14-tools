# Release Rehearsal: conversations migration

Run this before the production release of the conversations data model (sub-project 2), after sub-project 3 is built. It replays production's data through the migrations on your machine, so the real release is a repeat of something that already worked.

Everything here runs against the **local** stack, except step 1 (a read-only query), step 2 (a read-only dump) and step 7 (the push, only once you have confirmed it). The production password stays in your terminal: don't paste it into a chat or a file in the repo.

## 1. Record production's counts

In the Supabase dashboard's SQL editor (production, read-only):

```sql
-- Messages and sessions per channel
select c.id, c.name, c.archived,
       (select count(*) from public.messages m where m.channel_id = c.id)                 as messages,
       (select count(*) from public.messages m where m.channel_id = c.id and not m.deleted) as live_messages,
       (select count(*) from public.sessions s where s.channel_id = c.id)                 as sessions,
       (select count(*) from public.sessions s where s.channel_id = c.id and s.visible)   as visible_sessions
  from public.channels c
 order by c.position, c.created_at;

-- Users
select count(*) as users from auth.users;
select id, nickname, status from public.profiles order by nickname;
```

Save the output next to the date. Steps 6 and 7 compare against it.

## 2. Dump production's data (your terminal)

```bash
pg_dump --data-only --schema=public --schema=auth -Fc "$PROD_DB_URL" > prod.dump
```

`PROD_DB_URL` is the direct connection string from the dashboard (Project Settings → Database). Set it in your shell for this command only.

## 3. Rebuild the local database at the baseline

```bash
npm run db:stop && npm run db:start
npx --yes supabase@2 db reset --version 20261019080218 --no-seed
```

This leaves the local database on production's current schema (the baseline), with no data.

## 4. Load production's data

```bash
pg_restore --data-only --disable-triggers -d postgresql://postgres:postgres@127.0.0.1:54322/postgres prod.dump
```

## 5. Apply the conversations migrations

```bash
npx --yes supabase@2 migration up --local
```

The backfill checks its own counts. If any assertion fails, the migration aborts with a message and nothing is applied: stop here and investigate.

## 6. Compare

Against the counts from step 1:

- **Messages per space.** Main has the messages of `general` plus every extra channel; Schist has those of `schist`.

  ```sql
  select space, count(*) from public.messages group by space;
  ```

- **Sessions and visibility** are unchanged: the same number of sessions, and the same number visible.
- **Users** are unchanged, and every existing profile is a member of the one conversation.
- **PINs** still work: run the app against this database (`npm run dev:test`, which uses the local keys in `.env.test`, on port 5174), sign in with your real account, lock, and unlock with your PIN.

## 7. Dry run, then push

```bash
npx --yes supabase@2 db push --dry-run
```

Check that it lists exactly the conversations migrations. Run the real `db push` only once that is confirmed.

## 8. Clean up

```bash
rm prod.dump
npm run db:reset   # back to the normal seeded local database
```

## 9. Release, then contract

Deploy the app. A cached old app keeps working against the expanded schema (see "Known open issues" in the plan). After **both** phones show the new app, schedule the contract migration (see the roadmap's contract checklist).
