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
