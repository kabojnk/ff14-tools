-- Conversation RPCs: history, read positions, PIN, Drag/Fill the Lake, lake password, old-app change_sheets.
begin;
create extension if not exists pgtap with schema extensions;
select plan(39);

-- Uses the seed: conversation d000…0001 (Alice + Bea), general (main) + schist channels, session bbbb…0001.
-- A message in each space, and an extra channel the old app would also drag
insert into public.messages (conversation_id, space, session_id, author_id, content) values
  ('d0000000-0000-4000-8000-000000000001', 'main',   'bbbbbbbb-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'rpc main'),
  ('d0000000-0000-4000-8000-000000000001', 'schist', 'bbbbbbbb-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'rpc schist');
insert into public.channels (id, name, position) values ('aaaaaaaa-0000-4000-8000-0000000000f3', 'old-raids', 3);
-- Start without read positions for Alice: the app (or an e2e run) may have stored newer ones, and
-- mark_read never moves backwards. Rolled back with the rest of the test.
delete from public.read_positions
 where conversation_id = 'd0000000-0000-4000-8000-000000000001' and user_id = '11111111-1111-4111-8111-111111111111';

-- Alice
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

-- PIN
select throws_ok($$select public.set_pin('123')$$, '22023', null, 'set_pin rejects 3 digits');
select throws_ok($$select public.set_pin('1234567')$$, '22023', null, 'set_pin rejects 7 digits');
select throws_ok($$select public.set_pin('12a4')$$, '22023', null, 'set_pin rejects non-digits');
select ok(public.verify_pin('1234'), 'verify_pin: right PIN');
select ok(not public.verify_pin('9999'), 'verify_pin: wrong PIN');
select lives_ok($$select public.set_pin('24680')$$, 'set_pin accepts 5 digits');
select ok(public.verify_pin('24680') and not public.verify_pin('1234'), 'the new PIN replaces the old one');
select is((select lock_pin_length from public.profiles where id = auth.uid()), 5::smallint, 'lock_pin_length is 5');
select lives_ok($$select public.clear_pin()$$, 'clear_pin');
select ok(not public.verify_pin('24680'), 'no PIN verifies after clear_pin');
select is((select lock_pin_length from public.profiles where id = auth.uid()), null, 'lock_pin_length is null after clear_pin');

-- Read positions
select public.mark_read('d0000000-0000-4000-8000-000000000001', 'main', now() - interval '1 hour');
select public.mark_read('d0000000-0000-4000-8000-000000000001', 'main', now() - interval '2 hours');
select is((select last_read_at from public.read_positions where user_id = auth.uid() and space = 'main'),
  now() - interval '1 hour', 'mark_read never moves backwards');
select public.mark_read('d0000000-0000-4000-8000-000000000001', 'schist', now() + interval '1 day');
select is((select last_read_at from public.read_positions where user_id = auth.uid() and space = 'schist'),
  now(), 'a future time is clamped to now()');
select throws_ok($$select public.mark_read('d0000000-0000-4000-8000-000000000001', 'main', null)$$, '22023', null,
  'mark_read rejects a null time');
select throws_ok($$select public.mark_read('d0000000-0000-4000-8000-000000000001', 'lounge', now())$$, '22023', null,
  'mark_read rejects an unknown space');

-- History
select ok((select count(*) from public.get_messages('d0000000-0000-4000-8000-000000000001', 'schist')) >= 1,
  'get_messages returns Schist history');
select ok(not exists (select 1 from public.get_messages('d0000000-0000-4000-8000-000000000001', 'main') where space <> 'main'),
  'get_messages returns only the requested space');

-- Drag the Lake
select set_config('test.dragged', public.drag_the_lake('d0000000-0000-4000-8000-000000000001')::text, true);
select is((select count(*) from public.sessions where conversation_id = 'd0000000-0000-4000-8000-000000000001'), 1::bigint,
  'after a drag exactly one session is visible');
select is((select id from public.sessions where conversation_id = 'd0000000-0000-4000-8000-000000000001'),
  current_setting('test.dragged')::uuid, 'and it is the one drag_the_lake returned');
select is((select count(*) from public.get_messages('d0000000-0000-4000-8000-000000000001', 'main')), 0::bigint,
  'Main is empty after a drag');
select is((select count(*) from public.get_messages('d0000000-0000-4000-8000-000000000001', 'schist')), 0::bigint,
  'Schist is empty after a drag');

-- Fill the Lake
select is(public.fill_the_lake('d0000000-0000-4000-8000-000000000001', 'wrong'), false, 'a wrong password fails');
select is((select count(*) from public.sessions where conversation_id = 'd0000000-0000-4000-8000-000000000001'), 1::bigint,
  'and changes nothing');
select is(public.fill_the_lake('d0000000-0000-4000-8000-000000000001', 'test-lake-password'), true, 'the right password fills');
select ok((select count(*) from public.get_messages('d0000000-0000-4000-8000-000000000001', 'schist')) >= 1,
  'history is back');
reset role;
select ok(not exists (select 1 from public.sessions where conversation_id = 'd0000000-0000-4000-8000-000000000001' and not visible),
  'every session is visible after a fill');

-- Lake password
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is(public.set_lake_password('wrong', 'new-lake'), false, 'set_lake_password with a wrong current password fails');
select throws_ok($$select public.set_lake_password('test-lake-password', '   ')$$, '22023', null, 'a blank new password is rejected');
select is(public.set_lake_password('test-lake-password', 'new-lake'), true, 'set_lake_password changes it');
select is(public.fill_the_lake('d0000000-0000-4000-8000-000000000001', 'test-lake-password'), false, 'the old password no longer works');
select is(public.fill_the_lake('d0000000-0000-4000-8000-000000000001', 'new-lake'), true, 'the new password works');

-- Old app: change_sheets per channel, in a burst → one drag
select set_config('test.cs1', public.change_sheets('aaaaaaaa-0000-4000-8000-000000000001')::text, true);
select set_config('test.cs2', public.change_sheets('aaaaaaaa-0000-4000-8000-000000000002')::text, true);
select set_config('test.cs3', public.change_sheets('aaaaaaaa-0000-4000-8000-0000000000f3')::text, true);
select is(current_setting('test.cs2'), current_setting('test.cs1'), 'the second call in a burst returns the same session');
select is(current_setting('test.cs3'), current_setting('test.cs1'), 'the third call in a burst returns the same session');
select is((select count(*) from public.sessions where conversation_id = 'd0000000-0000-4000-8000-000000000001'), 1::bigint,
  'the burst leaves exactly one visible session');
insert into public.messages (channel_id, session_id, author_id, content) values
  ('aaaaaaaa-0000-4000-8000-000000000001', current_setting('test.cs1')::uuid, '11111111-1111-4111-8111-111111111111', 'after sheets');
select is((select count(*) from public.get_messages('d0000000-0000-4000-8000-000000000001', 'main') where content = 'after sheets'),
  1::bigint, 'a message sent into the returned session is visible');
reset role;

-- Cleo (not a member)
set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select ok(not public.verify_pin('1234'), 'verify_pin is false for someone with no PIN');
select throws_ok($$select public.mark_read('d0000000-0000-4000-8000-000000000001', 'main', now())$$, '42501', null,
  'a non-member cannot mark_read');
select throws_ok($$select public.set_lake_password('new-lake', 'cleo')$$, '42501', null,
  'a non-member cannot change the lake password');
reset role;

select ok(not has_function_privilege('anon', 'public.verify_pin(text)', 'execute'), 'anon cannot execute verify_pin');

select * from finish();
rollback;
