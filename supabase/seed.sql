-- Local/CI seed only. Never pushed to production (db push applies migrations, not seed).
-- Empty-string token columns: GoTrue fails login with "converting NULL to string" if they are NULL.
-- If a column here doesn't exist in your local auth schema (older CLI image), remove it from both lists.
-- Fixed UUIDs so e2e tests can reference rows directly (mirrored in e2e/users.ts as IDS).

-- Users: alice@test.local / password123 (PIN 1234), bea@test.local / password123 (PIN 567890),
-- cleo@test.local / password123 (no PIN; not a member of any conversation)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
) values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated',
   'alice@test.local', extensions.crypt('password123', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"nickname":"Alice"}', now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated',
   'bea@test.local', extensions.crypt('password123', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"nickname":"Bea"}', now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated',
   'cleo@test.local', extensions.crypt('password123', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"nickname":"Cleo"}', now(), now(), '', '', '', '', '', '', '', '');

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at) values
  (gen_random_uuid(), '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111',
   '{"sub":"11111111-1111-4111-8111-111111111111","email":"alice@test.local"}', 'email', now(), now(), now()),
  (gen_random_uuid(), '22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222',
   '{"sub":"22222222-2222-4222-8222-222222222222","email":"bea@test.local"}', 'email', now(), now(), now()),
  (gen_random_uuid(), '33333333-3333-4333-8333-333333333333', '33333333-3333-4333-8333-333333333333',
   '{"sub":"33333333-3333-4333-8333-333333333333","email":"cleo@test.local"}', 'email', now(), now(), now());

-- Profiles (upsert: works whether or not the signup trigger already created them). PINs are set further down.
insert into public.profiles (id, nickname, status) values
  ('11111111-1111-4111-8111-111111111111', 'Alice', 'offline'),
  ('22222222-2222-4222-8222-222222222222', 'Bea', 'offline'),
  ('33333333-3333-4333-8333-333333333333', 'Cleo', 'offline')
on conflict (id) do update set nickname = excluded.nickname, presence_override = null;

-- One conversation with Alice and Bea. Cleo is deliberately not a member.
insert into public.conversations (id, created_by, created_at) values
  ('d0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', now() - interval '30 days');
insert into public.conversation_members (conversation_id, user_id) values
  ('d0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111'),
  ('d0000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222');

-- Compatibility channels (old app): one per space
insert into public.channels (id, name, description, position, created_by, conversation_id, space) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'general', 'General discussion', 0, '11111111-1111-4111-8111-111111111111',
   'd0000000-0000-4000-8000-000000000001', 'main'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'schist', 'Schist', 1, '11111111-1111-4111-8111-111111111111',
   'd0000000-0000-4000-8000-000000000001', 'schist')
on conflict (name) do nothing;

-- Sessions belong to the whole conversation: the current visible one, and an older dragged one for Fill the Lake
insert into public.sessions (id, conversation_id, channel_id, visible, created_by, created_at) values
  ('bbbbbbbb-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001',
   true, '11111111-1111-4111-8111-111111111111', now() - interval '1 hour'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001',
   false, '11111111-1111-4111-8111-111111111111', now() - interval '1 day');

-- History. channel_id is filled by the compatibility trigger from conversation_id + space.
insert into public.messages (id, conversation_id, space, session_id, author_id, content, attachments, type, created_at) values
  -- Hidden session (Main): brought back by Fill the Lake
  ('cccccccc-0000-4000-8000-000000000010', 'd0000000-0000-4000-8000-000000000001', 'main', 'bbbbbbbb-0000-4000-8000-000000000002',
   '22222222-2222-4222-8222-222222222222', 'Seed: from the lake', '[]', 'text', now() - interval '1 day'),
  -- Media in Main
  ('cccccccc-0000-4000-8000-000000000011', 'd0000000-0000-4000-8000-000000000001', 'main', 'bbbbbbbb-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-111111111111', null,
   '[{"url":"http://cdn.test.local/media/test-image.png","type":"image","filename":"test-image.png","size":1024,"spoiler":false}]',
   'text', now() - interval '10 minutes'),
  ('cccccccc-0000-4000-8000-000000000012', 'd0000000-0000-4000-8000-000000000001', 'main', 'bbbbbbbb-0000-4000-8000-000000000001',
   '22222222-2222-4222-8222-222222222222', null,
   '[{"url":"http://cdn.test.local/media/clip.mp4","type":"video","filename":"clip.mp4","size":4096,"spoiler":false}]',
   'text', now() - interval '9 minutes'),
  ('cccccccc-0000-4000-8000-000000000013', 'd0000000-0000-4000-8000-000000000001', 'main', 'bbbbbbbb-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-111111111111', null,
   '[{"url":"http://cdn.test.local/media/dance.gif","type":"gif","filename":"dance","size":0,"spoiler":false}]',
   'gif', now() - interval '8 minutes'),
  ('cccccccc-0000-4000-8000-000000000014', 'd0000000-0000-4000-8000-000000000001', 'main', 'bbbbbbbb-0000-4000-8000-000000000001',
   '22222222-2222-4222-8222-222222222222', 'Seed: raid plan',
   '[{"url":"http://cdn.test.local/media/raid.PMP","type":"file","filename":"raid.PMP","size":2048,"spoiler":false}]',
   'text', now() - interval '7 minutes'),
  ('cccccccc-0000-4000-8000-000000000015', 'd0000000-0000-4000-8000-000000000001', 'main', 'bbbbbbbb-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-111111111111', null,
   '[{"url":"http://cdn.test.local/media/notes.zip","type":"file","filename":"notes.zip","size":512,"spoiler":false}]',
   'text', now() - interval '6 minutes'),
  ('cccccccc-0000-4000-8000-000000000016', 'd0000000-0000-4000-8000-000000000001', 'main', 'bbbbbbbb-0000-4000-8000-000000000001',
   '22222222-2222-4222-8222-222222222222', 'Seed: see https://example.com/guide', '[]', 'text', now() - interval '5 minutes'),
  -- Main conversation
  ('cccccccc-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'main', 'bbbbbbbb-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-111111111111', 'Seed: hi Bea', '[]', 'text', now() - interval '3 minutes'),
  ('cccccccc-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001', 'main', 'bbbbbbbb-0000-4000-8000-000000000001',
   '22222222-2222-4222-8222-222222222222', 'Seed: hey **Alice**', '[]', 'text', now() - interval '2 minutes'),
  ('cccccccc-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000001', 'main', 'bbbbbbbb-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-111111111111', 'Seed: pinned note', '[]', 'text', now() - interval '1 minute'),
  -- Schist
  ('cccccccc-0000-4000-8000-000000000020', 'd0000000-0000-4000-8000-000000000001', 'schist', 'bbbbbbbb-0000-4000-8000-000000000001',
   '22222222-2222-4222-8222-222222222222', 'Seed: schist hello', '[]', 'text', now() - interval '2 minutes');

insert into public.reactions (message_id, user_id, emoji) values
  ('cccccccc-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', '❤️');

insert into public.pinned_messages (conversation_id, channel_id, message_id, pinned_by) values
  ('d0000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001',
   'cccccccc-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111');

-- Custom emoji (served by the e2e CDN stub)
insert into public.custom_emoji (name, image_url, uploaded_by) values
  ('moogle', 'http://cdn.test.local/emoji/moogle.png', '11111111-1111-4111-8111-111111111111'),
  ('chocobo', 'http://cdn.test.local/emoji/chocobo.png', '22222222-2222-4222-8222-222222222222');

-- Eep passphrase (test value only)
insert into public.settings (key, value) values ('eep_passphrase', 'test-passphrase')
on conflict (key) do update set value = excluded.value;

-- Statuses: the four legacy definitions come from the migration. Alice uses one for the status tests.
update public.profiles set status_id = (select id from public.status_definitions where legacy_key = 'found_out')
 where id = '11111111-1111-4111-8111-111111111111';

-- PINs through the hashing path. lock_pin is kept in step only for cached old apps; the compat trigger
-- sees that the hash already verifies and leaves it alone.
insert into public.private_pins (user_id, pin_hash) values
  ('11111111-1111-4111-8111-111111111111', extensions.crypt('1234', extensions.gen_salt('bf'))),
  ('22222222-2222-4222-8222-222222222222', extensions.crypt('567890', extensions.gen_salt('bf')))
on conflict (user_id) do update set pin_hash = excluded.pin_hash;
update public.profiles set lock_pin_length = 4, lock_pin = '1234' where id = '11111111-1111-4111-8111-111111111111';
update public.profiles set lock_pin_length = 6, lock_pin = '567890' where id = '22222222-2222-4222-8222-222222222222';

-- Lake password (local only): test-lake-password
update public.private_secrets set value_hash = extensions.crypt('test-lake-password', extensions.gen_salt('bf'))
 where key = 'lake_password';
