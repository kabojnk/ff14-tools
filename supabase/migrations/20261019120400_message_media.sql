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

-- Backfill only messages that have no rows yet, so a re-run keeps existing row IDs (paging cursors stay valid).
do $$
declare
  m public.messages;
  n bigint;
  v_expected bigint;
begin
  for m in select * from public.messages x
            where not exists (select 1 from public.message_media mm where mm.message_id = x.id) loop
    perform public.rebuild_message_media(m);
  end loop;

  -- Assertion: one attachment row per attachment with a URL on every live, mapped message.
  select count(*) into v_expected
    from public.messages x, jsonb_array_elements(case when jsonb_typeof(x.attachments) = 'array' then x.attachments else '[]'::jsonb end) a
   where not x.deleted and x.conversation_id is not null and coalesce(a->>'url', '') <> '';
  select count(*) into n from public.message_media where kind <> 'link';
  if n <> v_expected then raise exception 'media backfill: expected % attachment rows, got %', v_expected, n; end if;
end $$;

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
