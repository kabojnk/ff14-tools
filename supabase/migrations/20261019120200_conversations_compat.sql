-- Sub-project 2 (expand): keep a cached old app (channel-based) and the new app (conversation-based) in step.
-- Removed by the contract migration.

create or replace function public.compat_default_conversation()
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.conversations where not archived order by created_at limit 1
$$;
revoke execute on function public.compat_default_conversation() from public, anon, authenticated;

-- New channel from an old app: map it to Main of the default conversation.
create or replace function public.channels_compat() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.conversation_id is null then
    new.conversation_id := public.compat_default_conversation();
    new.space := coalesce(new.space, 'main');
  end if;
  return new;
end $$;
drop trigger if exists channels_compat on public.channels;
create trigger channels_compat before insert on public.channels
  for each row execute function public.channels_compat();

-- The channel row that represents a conversation's space (for old-app reads).
create or replace function public.compat_channel_for(p_conversation uuid, p_space text)
returns uuid language sql stable security definer set search_path = '' as $$
  select c.id from public.channels c
   where c.conversation_id = p_conversation and c.space = p_space
   order by c.archived, c.position, c.created_at
   limit 1
$$;
revoke execute on function public.compat_channel_for(uuid, text) from public, anon, authenticated;

create or replace function public.messages_compat() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.conversation_id is null and new.channel_id is not null then
    select c.conversation_id, c.space into new.conversation_id, new.space
      from public.channels c where c.id = new.channel_id;
    if new.conversation_id is null then
      raise notice 'messages_compat: channel % is not mapped; using main', new.channel_id;
      new.conversation_id := public.compat_default_conversation();
      new.space := 'main';
    end if;
  elsif new.channel_id is null and new.conversation_id is not null then
    new.channel_id := public.compat_channel_for(new.conversation_id, new.space);
  end if;
  -- A message must belong to its session's conversation; never trust the client for this.
  if new.session_id is not null and exists (
       select 1 from public.sessions s
        where s.id = new.session_id and s.conversation_id is distinct from new.conversation_id) then
    raise exception 'message session belongs to a different conversation' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists messages_compat on public.messages;
create trigger messages_compat before insert or update of channel_id, conversation_id, space on public.messages
  for each row execute function public.messages_compat();

-- Sessions belong to the conversation; old apps see them on the Main channel.
create or replace function public.sessions_compat() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.conversation_id is null and new.channel_id is not null then
    select c.conversation_id into new.conversation_id from public.channels c where c.id = new.channel_id;
    new.conversation_id := coalesce(new.conversation_id, public.compat_default_conversation());
  elsif new.channel_id is null and new.conversation_id is not null then
    new.channel_id := public.compat_channel_for(new.conversation_id, 'main');
  end if;
  return new;
end $$;
drop trigger if exists sessions_compat on public.sessions;
create trigger sessions_compat before insert on public.sessions
  for each row execute function public.sessions_compat();

create or replace function public.pins_compat() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Always taken from the pinned message, so a pin can't point across conversations.
  select m.conversation_id into new.conversation_id from public.messages m where m.id = new.message_id;
  if new.channel_id is null then
    select m.channel_id into new.channel_id from public.messages m where m.id = new.message_id;
  end if;
  return new;
end $$;
drop trigger if exists pins_compat on public.pinned_messages;
create trigger pins_compat before insert on public.pinned_messages
  for each row execute function public.pins_compat();

-- Old app writes a legacy custom status into profiles.status → map to the shared definition.
-- Automatic presence values (online/away/offline) leave status_id alone.
create or replace function public.profiles_status_compat() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status and new.status not in ('online', 'away', 'offline') then
    new.status_id := (select d.id from public.status_definitions d where d.legacy_key = new.status);
  end if;
  return new;
end $$;
drop trigger if exists profiles_status_compat on public.profiles;
create trigger profiles_status_compat before update of status on public.profiles
  for each row execute function public.profiles_status_compat();

-- Old app sets/clears the PIN by writing profiles.lock_pin directly → keep the hash and length in step.
-- set_pin()/clear_pin() also write lock_pin; the "already verifies" check avoids hashing twice.
create or replace function public.profiles_pin_compat() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.lock_pin is null then
    delete from public.private_pins where user_id = new.id;
    new.lock_pin_length := null;
  elsif new.lock_pin !~ '^[0-9]{4,6}$' then
    raise exception 'PIN must be 4–6 digits' using errcode = '22023';
  else
    if not exists (select 1 from public.private_pins pp
                    where pp.user_id = new.id and pp.pin_hash = extensions.crypt(new.lock_pin, pp.pin_hash)) then
      insert into public.private_pins (user_id, pin_hash)
      values (new.id, extensions.crypt(new.lock_pin, extensions.gen_salt('bf')))
      on conflict (user_id) do update set pin_hash = excluded.pin_hash;
    end if;
    new.lock_pin_length := char_length(new.lock_pin);
  end if;
  return new;
end $$;
drop trigger if exists profiles_pin_compat on public.profiles;
create trigger profiles_pin_compat before update of lock_pin on public.profiles
  for each row execute function public.profiles_pin_compat();
