-- Old-app (channel-based) ↔ new-app (conversation-based) compatibility triggers.
begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

-- Uses the seed: conversation d000…0001 (Alice + Bea), general (main) + schist channels, session bbbb…0001.

-- Messages: old app sends channel_id only
insert into public.messages (id, channel_id, session_id, author_id, content) values
  ('f0000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000002',
   'bbbbbbbb-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'old app → schist');
select results_eq(
  $$select conversation_id, space from public.messages where id = 'f0000000-0000-4000-8000-000000000001'$$,
  $$values ('d0000000-0000-4000-8000-000000000001'::uuid, 'schist'::text)$$,
  'channel_id-only insert gets conversation_id and space');

-- Messages: new app sends conversation_id/space only
insert into public.messages (id, conversation_id, space, session_id, author_id, content) values
  ('f0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001', 'main',
   'bbbbbbbb-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'new app → main');
select is((select channel_id from public.messages where id = 'f0000000-0000-4000-8000-000000000002'),
  'aaaaaaaa-0000-4000-8000-000000000001'::uuid, 'conversation-only insert gets the general channel_id');

-- New channel from an old app is mapped to Main
insert into public.channels (id, name, position) values ('aaaaaaaa-0000-4000-8000-0000000000f1', 'new-from-old-app', 9);
select results_eq(
  $$select conversation_id, space from public.channels where id = 'aaaaaaaa-0000-4000-8000-0000000000f1'$$,
  $$values ('d0000000-0000-4000-8000-000000000001'::uuid, 'main'::text)$$,
  'a new channel is mapped to Main of the default conversation');

-- Unmapped channel → Main
update public.channels set conversation_id = null, space = null where id = 'aaaaaaaa-0000-4000-8000-0000000000f1';
insert into public.messages (id, channel_id, session_id, author_id, content) values
  ('f0000000-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-0000000000f1',
   'bbbbbbbb-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'unmapped');
select results_eq(
  $$select conversation_id, space from public.messages where id = 'f0000000-0000-4000-8000-000000000003'$$,
  $$values ('d0000000-0000-4000-8000-000000000001'::uuid, 'main'::text)$$,
  'an insert on an unmapped channel lands in Main');

-- Sessions: channel_id only
insert into public.sessions (id, channel_id, visible) values
  ('bbbbbbbb-0000-4000-8000-0000000000f1', 'aaaaaaaa-0000-4000-8000-000000000002', true);
select is((select conversation_id from public.sessions where id = 'bbbbbbbb-0000-4000-8000-0000000000f1'),
  'd0000000-0000-4000-8000-000000000001'::uuid, 'channel_id-only session gets conversation_id');
-- Sessions: conversation_id only → Main channel for old apps
insert into public.sessions (id, conversation_id, visible) values
  ('bbbbbbbb-0000-4000-8000-0000000000f2', 'd0000000-0000-4000-8000-000000000001', true);
select is((select channel_id from public.sessions where id = 'bbbbbbbb-0000-4000-8000-0000000000f2'),
  'aaaaaaaa-0000-4000-8000-000000000001'::uuid, 'conversation-only session gets the Main channel');

-- Pins: channel_id only
insert into public.pinned_messages (id, channel_id, message_id, pinned_by) values
  ('99999999-0000-4000-8000-0000000000f1', 'aaaaaaaa-0000-4000-8000-000000000002',
   'f0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111');
select is((select conversation_id from public.pinned_messages where id = '99999999-0000-4000-8000-0000000000f1'),
  'd0000000-0000-4000-8000-000000000001'::uuid, 'channel_id-only pin gets conversation_id');

-- Statuses
update public.profiles set status = 'potential_eep' where id = '22222222-2222-4222-8222-222222222222';
select is((select status_id from public.profiles where id = '22222222-2222-4222-8222-222222222222'),
  (select id from public.status_definitions where legacy_key = 'potential_eep'), 'legacy status maps to its definition');
update public.profiles set status = 'online' where id = '22222222-2222-4222-8222-222222222222';
select is((select status_id from public.profiles where id = '22222222-2222-4222-8222-222222222222'),
  (select id from public.status_definitions where legacy_key = 'potential_eep'), 'presence value leaves status_id alone');
delete from public.status_definitions where legacy_key = 'potential_eep';
select is((select status_id from public.profiles where id = '22222222-2222-4222-8222-222222222222'),
  null, 'deleting a status definition clears status_id');
select lives_ok($$update public.profiles set status = 'potential_eep' where id = '22222222-2222-4222-8222-222222222222'$$,
  'a legacy status with no definition is still a valid write');
select is((select status_id from public.profiles where id = '22222222-2222-4222-8222-222222222222'),
  null, 'unknown legacy status gives a null status_id');

-- Old-app PIN writes re-hash
update public.profiles set lock_pin = '4444' where id = '11111111-1111-4111-8111-111111111111';
select ok((select pin_hash = extensions.crypt('4444', pin_hash) from public.private_pins
            where user_id = '11111111-1111-4111-8111-111111111111'), 'old-app lock_pin write updates the hash');
select ok((select pin_hash <> extensions.crypt('1234', pin_hash) from public.private_pins
            where user_id = '11111111-1111-4111-8111-111111111111'), 'the previous PIN no longer verifies');
select is((select lock_pin_length from public.profiles where id = '11111111-1111-4111-8111-111111111111'),
  4::smallint, 'lock_pin_length follows the old-app write');
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select ok(public.verify_pin('4444') and not public.verify_pin('1234'), 'verify_pin follows the old-app write');
update public.profiles set lock_pin = null where id = '11111111-1111-4111-8111-111111111111';
select ok(not exists (select 1 from public.private_pins where user_id = '11111111-1111-4111-8111-111111111111')
          and (select lock_pin_length from public.profiles where id = '11111111-1111-4111-8111-111111111111') is null,
  'clearing lock_pin removes the hash and the length');
select ok(not public.verify_pin('4444'), 'verify_pin is false after the old app clears the PIN');

-- Cross-conversation integrity
insert into public.conversations (id) values ('d0000000-0000-4000-8000-0000000000f9');
insert into public.sessions (id, conversation_id, visible) values
  ('bbbbbbbb-0000-4000-8000-0000000000f9', 'd0000000-0000-4000-8000-0000000000f9', true);
select throws_ok(
  $$insert into public.messages (conversation_id, space, session_id, author_id, content) values
    ('d0000000-0000-4000-8000-000000000001', 'main', 'bbbbbbbb-0000-4000-8000-0000000000f9',
     '11111111-1111-4111-8111-111111111111', 'cross')$$,
  '23514', 'message session belongs to a different conversation', 'a message cannot use another conversation''s session');
insert into public.pinned_messages (id, conversation_id, channel_id, message_id, pinned_by) values
  ('99999999-0000-4000-8000-0000000000f2', 'd0000000-0000-4000-8000-0000000000f9', 'aaaaaaaa-0000-4000-8000-000000000001',
   'f0000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111');
select is((select conversation_id from public.pinned_messages where id = '99999999-0000-4000-8000-0000000000f2'),
  'd0000000-0000-4000-8000-000000000001'::uuid, 'a pin always takes the message''s conversation');

select throws_like(
  $$insert into public.messages (conversation_id, session_id, author_id, content) values
    ('d0000000-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001',
     '11111111-1111-4111-8111-111111111111', 'no space')$$,
  '%messages_space_required%', 'a message with a conversation but no space is rejected');

-- Old app as a real user: RLS WITH CHECK runs after the BEFORE trigger, so a channel_id-only insert passes.
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok(
  $$insert into public.messages (id, channel_id, session_id, author_id, content) values
    ('f0000000-0000-4000-8000-000000000004', 'aaaaaaaa-0000-4000-8000-000000000002',
     'bbbbbbbb-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'old app as Alice')$$,
  'an old-app insert as Alice with only channel_id passes RLS');
reset role;
select results_eq(
  $$select conversation_id, space from public.messages where id = 'f0000000-0000-4000-8000-000000000004'$$,
  $$values ('d0000000-0000-4000-8000-000000000001'::uuid, 'schist'::text)$$,
  'and lands in Schist');

select * from finish();
rollback;
