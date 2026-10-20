-- Sub-project 3a (expand): mark or unmark a posted photo/video/GIF as a spoiler (either member, any message).
alter table public.message_media add column if not exists spoiler boolean not null default false;

-- Same as 20261019120400, plus the spoiler flag. Only a JSON true counts; any other value (a string,
-- a number, a missing key) reads as false, so a malformed attachment never breaks an insert.
create or replace function public.rebuild_message_media(m public.messages)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.message_media where message_id = m.id;
  if m.deleted or m.conversation_id is null or m.space is null then return; end if;

  insert into public.message_media (message_id, conversation_id, space, session_id, kind, url, filename, extension, size, spoiler, created_at)
  select m.id, m.conversation_id, m.space, m.session_id,
         case when a->>'type' in ('image', 'video', 'gif', 'file', 'audio') then a->>'type' else 'file' end,
         a->>'url', a->>'filename', public.file_extension(a->>'filename'),
         case when a->>'size' ~ '^[0-9]+(\.[0-9]+)?$' then (a->>'size')::numeric::bigint end,
         coalesce(a->'spoiler' = 'true'::jsonb, false),
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

-- Backfill the flag in place: row IDs (gallery paging cursors) are kept, and a re-run changes nothing.
update public.message_media mm set spoiler = true
  from public.messages m, jsonb_array_elements(case when jsonb_typeof(m.attachments) = 'array' then m.attachments else '[]'::jsonb end) a
 where mm.message_id = m.id and mm.kind <> 'link' and mm.url = a->>'url'
   and a->'spoiler' = 'true'::jsonb and not mm.spoiler;

create or replace function public.set_attachment_spoiler(p_message uuid, p_index integer, p_spoiler boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_conv uuid;
  v_deleted boolean;
  v_visible boolean;
  v_att jsonb;
begin
  select m.conversation_id, m.deleted, s.visible,
         case when jsonb_typeof(m.attachments) = 'array' and p_index >= 0 then m.attachments -> p_index end
    into v_conv, v_deleted, v_visible, v_att
    from public.messages m
    left join public.sessions s on s.id = m.session_id
   where m.id = p_message;
  if v_conv is null then raise exception 'message not found' using errcode = '22023'; end if;
  perform public.require_member(v_conv);
  if v_deleted then raise exception 'message is deleted' using errcode = '22023'; end if;
  if not coalesce(v_visible, false) then raise exception 'message is not in a visible session' using errcode = '22023'; end if;
  if p_spoiler is null then raise exception 'p_spoiler is required' using errcode = '22023'; end if;
  if v_att is null or jsonb_typeof(v_att) <> 'object' then
    raise exception 'no attachment at index %', p_index using errcode = '22023';
  end if;
  if v_att->>'type' is null or v_att->>'type' not in ('image', 'video', 'gif') then
    raise exception 'only photos, videos and GIFs can be spoilers' using errcode = '22023';
  end if;
  update public.messages
     set attachments = jsonb_set(attachments, array[p_index::text, 'spoiler'], to_jsonb(p_spoiler), true)
   where id = p_message;
  -- messages_sync_media (after update of attachments) rebuilds the media rows, carrying the flag.
end $$;
revoke execute on function public.set_attachment_spoiler(uuid, integer, boolean) from public, anon;
grant execute on function public.set_attachment_spoiler(uuid, integer, boolean) to authenticated;
