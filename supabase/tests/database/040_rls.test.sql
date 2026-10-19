-- Chat data is visible to conversation members only; secrets and hidden sessions stay hidden.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- Uses the seed: conversation d000…0001 (Alice + Bea), general (main) + schist channels, session bbbb…0001.

-- A hidden (dragged) session with one message
insert into public.sessions (id, conversation_id, visible, created_at) values
  ('bbbbbbbb-0000-4000-8000-0000000000e1', 'd0000000-0000-4000-8000-000000000001', false, now() - interval '2 days');
insert into public.messages (id, conversation_id, space, session_id, author_id, content, created_at) values
  ('f0000000-0000-4000-8000-0000000000e1', 'd0000000-0000-4000-8000-000000000001', 'main',
   'bbbbbbbb-0000-4000-8000-0000000000e1', '22222222-2222-4222-8222-222222222222', 'hidden', now() - interval '2 days');

-- A second conversation Alice isn't in
insert into public.conversations (id) values ('d0000000-0000-4000-8000-0000000000f9');
insert into public.sessions (id, conversation_id, visible) values
  ('bbbbbbbb-0000-4000-8000-0000000000f9', 'd0000000-0000-4000-8000-0000000000f9', true);

-- What Alice should get from the old history RPC: visible, not-deleted general messages
select set_config('test.general_visible', (
  select count(*)::text from public.messages m join public.sessions s on s.id = m.session_id
   where m.channel_id = 'aaaaaaaa-0000-4000-8000-000000000001' and s.visible and not m.deleted), true);

-- Cleo (not a member) sees nothing
set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select is((select count(*) from public.messages), 0::bigint, 'Cleo sees no messages');
select is((select count(*) from public.sessions), 0::bigint, 'Cleo sees no sessions');
select is((select count(*) from public.pinned_messages), 0::bigint, 'Cleo sees no pins');
select is((select count(*) from public.reactions), 0::bigint, 'Cleo sees no reactions');
select is((select count(*) from public.conversations), 0::bigint, 'Cleo sees no conversations');
select is((select count(*) from public.conversation_members), 0::bigint, 'Cleo sees no memberships');
select is((select count(*) from public.channels), 0::bigint, 'Cleo sees no channels');
select is((select count(*) from public.get_channel_messages('aaaaaaaa-0000-4000-8000-000000000001')), 0::bigint,
  'old history RPC returns nothing to Cleo');
-- Statuses are shared with anyone signed in
select lives_ok($$insert into public.status_definitions (id, label, color) values ('77777777-0000-4000-8000-000000000001', 'Cleo''s', '#123456')$$,
  'Cleo can add a status');
select lives_ok($$update public.status_definitions set color = '#654321' where id = '77777777-0000-4000-8000-000000000001'$$,
  'Cleo can edit a status');
select is((select color from public.status_definitions where id = '77777777-0000-4000-8000-000000000001'), '#654321',
  'the edit is applied');
select lives_ok($$delete from public.status_definitions where id = '77777777-0000-4000-8000-000000000001'$$,
  'Cleo can delete a status');
reset role;

-- Alice (member)
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select throws_ok(
  $$insert into public.messages (conversation_id, space, session_id, author_id, content) values
    ('d0000000-0000-4000-8000-000000000001', 'main', 'bbbbbbbb-0000-4000-8000-000000000001',
     '22222222-2222-4222-8222-222222222222', 'as Bea')$$,
  '42501', null, 'Alice cannot send as Bea');
select throws_ok(
  $$insert into public.messages (conversation_id, space, session_id, author_id, content) values
    ('d0000000-0000-4000-8000-0000000000f9', 'main', 'bbbbbbbb-0000-4000-8000-0000000000f9',
     '11111111-1111-4111-8111-111111111111', 'gatecrash')$$,
  '42501', null, 'Alice cannot send into a conversation she is not in');
select is((select count(*) from public.sessions where id = 'bbbbbbbb-0000-4000-8000-0000000000e1'), 0::bigint,
  'hidden sessions are invisible to members');
select is((select count(*) from public.messages where id = 'f0000000-0000-4000-8000-0000000000e1'), 0::bigint,
  'messages in hidden sessions are invisible to members');
select is((select count(*) from public.sessions where conversation_id = 'd0000000-0000-4000-8000-0000000000f9'), 0::bigint,
  'other conversations'' sessions are invisible');
select is((select count(*) from public.get_channel_messages('aaaaaaaa-0000-4000-8000-000000000001')),
  current_setting('test.general_visible')::bigint, 'old history RPC still returns visible messages to Alice');
update public.sessions set visible = true where id = 'bbbbbbbb-0000-4000-8000-0000000000e1';
update public.channels set space = 'schist' where id = 'aaaaaaaa-0000-4000-8000-000000000001';
select is(public.topic_conversation('conv:not-a-uuid'), null, 'a malformed topic maps to no conversation');
select ok(not public.is_member(public.topic_conversation('conv:not-a-uuid')), 'and membership of it is false');
select ok(public.is_member(public.topic_conversation('conv:d0000000-0000-4000-8000-000000000001')),
  'a well-formed topic of her conversation is authorised');
reset role;

select ok(not (select visible from public.sessions where id = 'bbbbbbbb-0000-4000-8000-0000000000e1'),
  'a member cannot un-hide a session directly');
select is((select space from public.channels where id = 'aaaaaaaa-0000-4000-8000-000000000001'), 'main',
  'a member cannot update channels');
select ok(not has_function_privilege('anon', 'public.get_channel_messages(uuid, integer, timestamptz)', 'execute'),
  'anon cannot execute the old history RPC');

select * from finish();
rollback;
