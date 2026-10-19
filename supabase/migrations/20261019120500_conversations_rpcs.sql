-- Sub-project 2 (expand): message history, read positions, PIN, Drag/Fill the Lake.

create or replace function public.get_messages(
  p_conversation uuid, p_space text, p_limit integer default 50, p_before timestamptz default null
) returns setof public.messages
language sql stable security invoker set search_path = '' as $$
  select m.* from public.messages m
    join public.sessions s on s.id = m.session_id and s.visible
   where m.conversation_id = p_conversation and m.space = p_space and not m.deleted
     and (p_before is null or m.created_at < p_before)
   order by m.created_at desc
   limit least(greatest(coalesce(p_limit, 50), 1), 200)
$$;

create or replace function public.require_member(p_conversation uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_member(p_conversation) then
    raise exception 'not a member of this conversation' using errcode = '42501';
  end if;
end $$;
revoke execute on function public.require_member(uuid) from public, anon, authenticated;

create or replace function public.mark_read(p_conversation uuid, p_space text, p_at timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_member(p_conversation);
  if p_space is null or p_space not in ('main', 'schist') then
    raise exception 'unknown space %', p_space using errcode = '22023';
  end if;
  if p_at is null then raise exception 'p_at is required' using errcode = '22023'; end if;
  insert into public.read_positions as rp (conversation_id, user_id, space, last_read_at)
  values (p_conversation, auth.uid(), p_space, least(p_at, now()))
  on conflict (conversation_id, user_id, space)
  do update set last_read_at = greatest(rp.last_read_at, excluded.last_read_at);
end $$;

create or replace function public.set_pin(p_pin text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if p_pin is null or p_pin !~ '^[0-9]{4,6}$' then
    raise exception 'PIN must be 4–6 digits' using errcode = '22023';
  end if;
  insert into public.private_pins (user_id, pin_hash)
  values (auth.uid(), extensions.crypt(p_pin, extensions.gen_salt('bf')))
  on conflict (user_id) do update set pin_hash = excluded.pin_hash;
  -- lock_pin is kept in step only for cached old apps; the contract migration drops it.
  update public.profiles set lock_pin_length = char_length(p_pin), lock_pin = p_pin where id = auth.uid();
end $$;

create or replace function public.clear_pin()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  delete from public.private_pins where user_id = auth.uid();
  update public.profiles set lock_pin_length = null, lock_pin = null where id = auth.uid();
end $$;

create or replace function public.verify_pin(p_pin text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select pp.pin_hash = extensions.crypt(p_pin, pp.pin_hash)
       from public.private_pins pp where pp.user_id = auth.uid()),
    false)
$$;

create or replace function public.drag_the_lake(p_conversation uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform public.require_member(p_conversation);
  perform 1 from public.conversations where id = p_conversation for update; -- serialise concurrent drags
  update public.sessions set visible = false where conversation_id = p_conversation and visible;
  insert into public.sessions (conversation_id, created_by, visible)
  values (p_conversation, auth.uid(), true) returning id into v_id;
  return v_id;
end $$;

create or replace function public.lake_password_ok(p_password text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select s.value_hash = extensions.crypt(p_password, s.value_hash)
       from public.private_secrets s where s.key = 'lake_password'),
    false)
$$;
revoke execute on function public.lake_password_ok(text) from public, anon, authenticated;

create or replace function public.fill_the_lake(p_conversation uuid, p_password text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_member(p_conversation);
  if p_password is null or not public.lake_password_ok(p_password) then return false; end if;
  update public.sessions set visible = true where conversation_id = p_conversation and not visible;
  return true;
end $$;

create or replace function public.set_lake_password(p_current text, p_new text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null
     or not exists (select 1 from public.conversation_members where user_id = auth.uid()) then
    raise exception 'only conversation members can change the lake password' using errcode = '42501';
  end if;
  if btrim(coalesce(p_new, '')) = '' then
    raise exception 'the new lake password cannot be blank' using errcode = '22023';
  end if;
  if p_current is null or not public.lake_password_ok(p_current) then return false; end if;
  update public.private_secrets set value_hash = extensions.crypt(p_new, extensions.gen_salt('bf'))
   where key = 'lake_password';
  return true;
end $$;

-- Old app: Drag the Lake per channel → drags the whole conversation.
-- The old app fires one call per channel at once. Only the first drags; repeats within 10 s that find a
-- fresh, empty, sole visible session return it, so no caller is left holding an already-hidden session.
create or replace function public.change_sheets(p_channel_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_conv uuid;
  v_recent uuid;
begin
  select conversation_id into v_conv from public.channels where id = p_channel_id;
  if v_conv is null then raise exception 'channel % is not mapped to a conversation', p_channel_id; end if;
  perform public.require_member(v_conv);
  perform 1 from public.conversations where id = v_conv for update; -- serialise the burst
  select s.id into v_recent from public.sessions s
   where s.conversation_id = v_conv and s.visible
     and s.created_at > now() - interval '10 seconds'
     and not exists (select 1 from public.messages m where m.session_id = s.id)
     and (select count(*) from public.sessions v where v.conversation_id = v_conv and v.visible) = 1
   order by s.created_at desc limit 1;
  if v_recent is not null then return v_recent; end if;
  return public.drag_the_lake(v_conv);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.get_messages(uuid, text, integer, timestamptz)',
    'public.mark_read(uuid, text, timestamptz)',
    'public.set_pin(text)', 'public.clear_pin()', 'public.verify_pin(text)',
    'public.drag_the_lake(uuid)', 'public.fill_the_lake(uuid, text)',
    'public.set_lake_password(text, text)', 'public.change_sheets(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
