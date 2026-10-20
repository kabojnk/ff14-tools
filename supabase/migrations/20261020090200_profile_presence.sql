-- Sub-project 3a (expand): presence storage that works across devices.
-- profiles.status defaults to 'offline', so it can't mean Invisible. The manual choice lives in
-- presence_override (null = follow the devices); last_seen_at is written by the app while it's open.
-- profiles.status is left as it is for cached old apps.
alter table public.profiles add column if not exists presence_override text;
alter table public.profiles add column if not exists last_seen_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.profiles'::regclass and conname = 'profiles_presence_override_check') then
    alter table public.profiles add constraint profiles_presence_override_check
      check (presence_override in ('away', 'invisible'));
  end if;
end $$;

create or replace function public.touch_last_seen()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  update public.profiles set last_seen_at = now() where id = auth.uid();
end $$;
revoke execute on function public.touch_last_seen() from public, anon;
grant execute on function public.touch_last_seen() to authenticated;
