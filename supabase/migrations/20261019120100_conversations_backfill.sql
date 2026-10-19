-- Sub-project 2 (expand): move existing data into the conversation model. Idempotent.
do $$
declare
  v_conv uuid;
  n bigint;
  v_total bigint;
begin
  -- Nothing to migrate on an empty database (fresh local reset: the seed creates its own conversation).
  if not exists (select 1 from public.profiles) then return; end if;

  select count(*) into v_total from public.messages;

  select id into v_conv from public.conversations order by created_at limit 1;
  if v_conv is null then
    insert into public.conversations (created_by)
    values ((select id from public.profiles order by created_at limit 1))
    returning id into v_conv;
  end if;

  -- Everyone who exists today is in the one conversation. Later sign-ups are not added automatically.
  insert into public.conversation_members (conversation_id, user_id)
  select v_conv, p.id from public.profiles p
  on conflict do nothing;

  -- general → main, schist → schist, anything else → main
  update public.channels
     set conversation_id = v_conv,
         space = case when name = 'schist' then 'schist' else 'main' end
   where conversation_id is null;

  -- Extra channels with no history (e.g. adventures) are archived. Nothing is deleted.
  update public.channels c set archived = true
   where c.name not in ('general', 'schist') and not c.archived
     and not exists (select 1 from public.messages m where m.channel_id = c.id);

  update public.sessions s set conversation_id = c.conversation_id
    from public.channels c where s.channel_id = c.id and s.conversation_id is null;
  update public.messages m set conversation_id = c.conversation_id, space = c.space
    from public.channels c where m.channel_id = c.id and m.conversation_id is null;
  update public.pinned_messages p set conversation_id = c.conversation_id
    from public.channels c where p.channel_id = c.id and p.conversation_id is null;

  -- Legacy custom statuses → shared definitions
  update public.profiles p set status_id = d.id
    from public.status_definitions d
   where d.legacy_key = p.status and p.status_id is null;

  -- PINs: hash into the private table. An invalid legacy PIN aborts loudly rather than silently unlocking someone.
  if exists (select 1 from public.profiles where lock_pin is not null and lock_pin !~ '^[0-9]{4,6}$') then
    raise exception 'backfill: a profile has a lock_pin that is not 4–6 digits; fix it before migrating';
  end if;
  insert into public.private_pins (user_id, pin_hash)
  select id, extensions.crypt(lock_pin, extensions.gen_salt('bf')) from public.profiles
   where lock_pin is not null
  on conflict (user_id) do nothing;
  update public.profiles set lock_pin_length = char_length(lock_pin)
   where lock_pin is not null and lock_pin_length is null;

  -- Assertions: any failure rolls the whole file back.
  select count(*) into n from public.messages where conversation_id is null or space is null;
  if n > 0 then raise exception 'backfill: % messages without a conversation/space', n; end if;
  select count(*) into n from public.messages;
  if n <> v_total then raise exception 'backfill: message count changed (% → %)', v_total, n; end if;
  -- every channel's messages landed in that channel's space
  select count(*) into n from public.messages m join public.channels c on c.id = m.channel_id
   where m.space is distinct from c.space or m.conversation_id is distinct from c.conversation_id;
  if n > 0 then raise exception 'backfill: % messages are in a different space from their channel', n; end if;
  select count(*) into n from public.sessions where conversation_id is null;
  if n > 0 then raise exception 'backfill: % sessions without a conversation', n; end if;
  select count(*) into n from public.pinned_messages where conversation_id is null;
  if n > 0 then raise exception 'backfill: % pins without a conversation', n; end if;
  select count(*) into n from public.profiles p
   where p.lock_pin is not null
     and not exists (select 1 from public.private_pins pp
                     where pp.user_id = p.id and pp.pin_hash = extensions.crypt(p.lock_pin, pp.pin_hash));
  if n > 0 then raise exception 'backfill: % PIN hashes do not verify', n; end if;
end $$;
