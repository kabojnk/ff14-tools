-- The local seed is in the new shape: one conversation (Alice + Bea), both spaces, a hidden session,
-- media of each kind, hashed PINs and the local lake password. Cleo is not a member.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

select is((select count(*) from public.conversations), 1::bigint, 'exactly one conversation');
select results_eq(
  $$select user_id from public.conversation_members where conversation_id = 'd0000000-0000-4000-8000-000000000001' order by user_id$$,
  $$values ('11111111-1111-4111-8111-111111111111'::uuid), ('22222222-2222-4222-8222-222222222222'::uuid)$$,
  'Alice and Bea are the members');
select ok(not exists (select 1 from public.conversation_members where user_id = '33333333-3333-4333-8333-333333333333'),
  'Cleo is not a member');
select results_eq(
  $$select id, conversation_id, space from public.channels order by position$$,
  $$values ('aaaaaaaa-0000-4000-8000-000000000001'::uuid, 'd0000000-0000-4000-8000-000000000001'::uuid, 'main'::text),
           ('aaaaaaaa-0000-4000-8000-000000000002'::uuid, 'd0000000-0000-4000-8000-000000000001'::uuid, 'schist'::text)$$,
  'general → main and schist → schist are mapped');
select results_eq(
  $$select id, visible from public.sessions order by created_at desc$$,
  $$values ('bbbbbbbb-0000-4000-8000-000000000001'::uuid, true), ('bbbbbbbb-0000-4000-8000-000000000002'::uuid, false)$$,
  'one visible session and one hidden (dragged) session');
select ok(not exists (select 1 from public.messages where conversation_id is null or space is null),
  'every message has a conversation and a space');
select ok(exists (select 1 from public.messages where space = 'schist' and content = 'Seed: schist hello'), 'Schist has a message');
select ok(exists (select 1 from public.messages where session_id = 'bbbbbbbb-0000-4000-8000-000000000002'
                   and content = 'Seed: from the lake'), 'the hidden session has a message to restore');
select results_eq(
  $$select kind, count(*) from public.message_media group by kind order by kind$$,
  $$values ('file'::text, 2::bigint), ('gif', 1), ('image', 1), ('link', 1), ('video', 1)$$,
  'media of each kind is indexed');
select ok(exists (select 1 from public.message_media where extension = 'pmp' and filename = 'raid.PMP'), 'raid.PMP indexes as pmp');
select is((select count(*) from public.pinned_messages where conversation_id = 'd0000000-0000-4000-8000-000000000001'), 1::bigint,
  'the pin is in the conversation');
select is((select status_id from public.profiles where id = '11111111-1111-4111-8111-111111111111'),
  (select id from public.status_definitions where legacy_key = 'found_out'), 'Alice has the Found Out status');
select ok((select pin_hash = extensions.crypt('1234', pin_hash) from public.private_pins
            where user_id = '11111111-1111-4111-8111-111111111111'), 'Alice''s PIN hash verifies');
select ok((select pin_hash = extensions.crypt('567890', pin_hash) from public.private_pins
            where user_id = '22222222-2222-4222-8222-222222222222'), 'Bea''s PIN hash verifies');
select results_eq(
  $$select id, lock_pin_length from public.profiles order by id$$,
  $$values ('11111111-1111-4111-8111-111111111111'::uuid, 4::smallint),
           ('22222222-2222-4222-8222-222222222222'::uuid, 6::smallint),
           ('33333333-3333-4333-8333-333333333333'::uuid, null::smallint)$$,
  'PIN lengths are 4, 6 and none');
select ok((select value_hash = extensions.crypt('test-lake-password', value_hash) from public.private_secrets
            where key = 'lake_password'), 'the local lake password is test-lake-password');

select * from finish();
rollback;
