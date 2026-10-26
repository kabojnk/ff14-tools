-- Sub-project 5 (expand): voice memos. Who has started playing which memo, written only through
-- mark_voice_played(), and each memo's length in the media index for the gallery's Voice tab.

create table if not exists public.voice_plays (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  played_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
alter table public.voice_plays enable row level security;
revoke insert, update, delete on public.voice_plays from anon, authenticated;

-- Own plays always; someone else's only when BOTH have read receipts on (the read_positions rule).
drop policy if exists "voice plays per receipts setting" on public.voice_plays;
create policy "voice plays per receipts setting" on public.voice_plays for select to authenticated
  using (
    user_id = auth.uid()
    or (exists (select 1 from public.messages m
                 where m.id = voice_plays.message_id and public.is_member(m.conversation_id))
        and (select p.read_receipts from public.profiles p where p.id = auth.uid())
        and (select p.read_receipts from public.profiles p where p.id = voice_plays.user_id))
  );

-- Starting playback of someone else's memo marks it played (once).
create or replace function public.mark_voice_played(p_message uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_conv uuid;
  v_author uuid;
  v_deleted boolean;
  v_audio boolean;
begin
  select m.conversation_id, m.author_id, m.deleted,
         exists (select 1
                   from jsonb_array_elements(case when jsonb_typeof(m.attachments) = 'array' then m.attachments else '[]'::jsonb end) a
                  where a->>'type' = 'audio')
    into v_conv, v_author, v_deleted, v_audio
    from public.messages m
   where m.id = p_message;
  if v_conv is null then raise exception 'message not found' using errcode = '22023'; end if;
  perform public.require_member(v_conv);
  if v_deleted then raise exception 'message is deleted' using errcode = '22023'; end if;
  if not v_audio then raise exception 'not a voice message' using errcode = '22023'; end if;
  if v_author = auth.uid() then raise exception 'cannot mark your own voice message' using errcode = '22023'; end if;
  insert into public.voice_plays (message_id, user_id) values (p_message, auth.uid())
  on conflict do nothing;
end $$;
revoke execute on function public.mark_voice_played(uuid) from public, anon;
grant execute on function public.mark_voice_played(uuid) to authenticated;

-- Live for both people (RLS decides what each receives).
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'voice_plays') then
    alter publication supabase_realtime add table public.voice_plays;
  end if;
end $$;

-- The gallery shows each memo's length.
alter table public.message_media add column if not exists duration_ms integer;

-- Same as 20261020090000, plus duration_ms (only a plain whole number counts; anything else is null).
create or replace function public.rebuild_message_media(m public.messages)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.message_media where message_id = m.id;
  if m.deleted or m.conversation_id is null or m.space is null then return; end if;

  insert into public.message_media (message_id, conversation_id, space, session_id, kind, url, filename, extension, size, spoiler, duration_ms, created_at)
  select m.id, m.conversation_id, m.space, m.session_id,
         case when a->>'type' in ('image', 'video', 'gif', 'file', 'audio') then a->>'type' else 'file' end,
         a->>'url', a->>'filename', public.file_extension(a->>'filename'),
         case when a->>'size' ~ '^[0-9]+(\.[0-9]+)?$' then (a->>'size')::numeric::bigint end,
         coalesce(a->'spoiler' = 'true'::jsonb, false),
         case when a->>'duration_ms' ~ '^[0-9]{1,9}$' then (a->>'duration_ms')::integer end,
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

-- Backfill in place (row IDs, the gallery's paging cursors, are kept; a re-run changes nothing).
update public.message_media mm set duration_ms = (a->>'duration_ms')::integer
  from public.messages m, jsonb_array_elements(case when jsonb_typeof(m.attachments) = 'array' then m.attachments else '[]'::jsonb end) a
 where mm.message_id = m.id and mm.kind = 'audio' and mm.url = a->>'url'
   and a->>'duration_ms' ~ '^[0-9]{1,9}$' and mm.duration_ms is null;

-- Unchanged body, re-created so the returned row type is re-read with the new column.
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
