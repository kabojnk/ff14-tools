-- Local/CI seed only. Never pushed to production (db push applies migrations, not seed).
-- Empty-string token columns: GoTrue fails login with "converting NULL to string" if they are NULL.
-- If a column here doesn't exist in your local auth schema (older CLI image), remove it from both lists.
-- Fixed UUIDs so e2e tests can reference rows directly.

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

-- Profiles (upsert: works whether or not the signup trigger already created them)
insert into public.profiles (id, nickname, status, lock_pin) values
  ('11111111-1111-4111-8111-111111111111', 'Alice', 'offline', '1234'),
  ('22222222-2222-4222-8222-222222222222', 'Bea', 'offline', '567890'),
  ('33333333-3333-4333-8333-333333333333', 'Cleo', 'offline', null)
on conflict (id) do update set nickname = excluded.nickname, lock_pin = excluded.lock_pin;

-- Channel + visible session
insert into public.channels (id, name, description, position, created_by) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'general', 'General discussion', 0, '11111111-1111-4111-8111-111111111111')
on conflict (name) do nothing;

insert into public.sessions (id, channel_id, visible, created_by) values
  ('bbbbbbbb-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', true, '11111111-1111-4111-8111-111111111111');

-- A little history
insert into public.messages (id, channel_id, session_id, author_id, content, created_at) values
  ('cccccccc-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-111111111111', 'Seed: hi Bea', now() - interval '3 minutes'),
  ('cccccccc-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001',
   '22222222-2222-4222-8222-222222222222', 'Seed: hey **Alice**', now() - interval '2 minutes'),
  ('cccccccc-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-111111111111', 'Seed: pinned note', now() - interval '1 minute');

insert into public.reactions (message_id, user_id, emoji) values
  ('cccccccc-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', '❤️');

insert into public.pinned_messages (channel_id, message_id, pinned_by) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111');

-- Custom emoji (served by the e2e CDN stub)
insert into public.custom_emoji (name, image_url, uploaded_by) values
  ('moogle', 'http://cdn.test.local/emoji/moogle.png', '11111111-1111-4111-8111-111111111111'),
  ('chocobo', 'http://cdn.test.local/emoji/chocobo.png', '22222222-2222-4222-8222-222222222222');

-- Eep passphrase (test value only)
insert into public.settings (key, value) values ('eep_passphrase', 'test-passphrase')
on conflict (key) do update set value = excluded.value;
