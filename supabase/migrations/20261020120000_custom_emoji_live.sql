-- Custom emoji: name format for new names, the adder is the signed-in user, live updates.
-- Additive and safe to re-run.

-- New names only: NOT VALID, so rows already in production are never re-checked.
do $$
begin
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.custom_emoji'::regclass and conname = 'custom_emoji_name_format') then
    alter table public.custom_emoji
      add constraint custom_emoji_name_format check (name ~ '^[a-z0-9_]{2,32}$') not valid;
  end if;
end $$;

-- The adder is always the signed-in user. Deliberately breaking for anything inserting as someone else;
-- no app version ever had an add-emoji flow. The default lets an insert leave the adder out.
alter table public.custom_emoji alter column uploaded_by set default auth.uid();

drop policy if exists "Authenticated users can upload custom emoji" on public.custom_emoji;
drop policy if exists "Members add their own custom emoji" on public.custom_emoji;
create policy "Members add their own custom emoji" on public.custom_emoji
  for insert to authenticated with check (uploaded_by = (select auth.uid()));

-- Live updates for both people.
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'custom_emoji') then
    alter publication supabase_realtime add table public.custom_emoji;
  end if;
end $$;
