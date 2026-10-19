-- Reply links: same conversation only; a hard delete clears the link, a soft delete keeps it.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

select has_column('public', 'messages', 'reply_to', 'messages.reply_to exists');
select fk_ok('public', 'messages', 'reply_to', 'public', 'messages', 'id', 'reply_to references messages');

-- A second conversation (Alice + Cleo) to reply across
insert into public.conversations (id) values ('d0000000-0000-4000-8000-000000000071');
insert into public.conversation_members (conversation_id, user_id) values
  ('d0000000-0000-4000-8000-000000000071', '11111111-1111-4111-8111-111111111111'),
  ('d0000000-0000-4000-8000-000000000071', '33333333-3333-4333-8333-333333333333');
insert into public.sessions (id, conversation_id, visible) values
  ('bbbbbbbb-0000-4000-8000-000000000071', 'd0000000-0000-4000-8000-000000000071', true);
insert into public.messages (id, conversation_id, space, session_id, author_id, content) values
  ('e7100000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000071', 'main',
   'bbbbbbbb-0000-4000-8000-000000000071', '33333333-3333-4333-8333-333333333333', 'elsewhere'),
  ('e7100000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001', 'main',
   'bbbbbbbb-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'original');

-- As Alice, through RLS
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok($$insert into public.messages (id, conversation_id, space, session_id, author_id, content, reply_to) values
  ('e7100000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000001', 'main', 'bbbbbbbb-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-111111111111', 'a reply', 'e7100000-0000-4000-8000-000000000002')$$,
  'a reply in the same conversation is stored');
select is((select reply_to from public.messages where id = 'e7100000-0000-4000-8000-000000000003'),
  'e7100000-0000-4000-8000-000000000002'::uuid, 'reply_to is kept');
select throws_ok($$insert into public.messages (conversation_id, space, session_id, author_id, content, reply_to) values
  ('d0000000-0000-4000-8000-000000000001', 'main', 'bbbbbbbb-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-111111111111', 'cross', 'e7100000-0000-4000-8000-000000000001')$$,
  '23514', null, 'a reply to another conversation''s message is rejected');
select throws_ok($$update public.messages set reply_to = 'e7100000-0000-4000-8000-000000000001'
                    where id = 'e7100000-0000-4000-8000-000000000003'$$,
  '23514', null, 'repointing a reply at another conversation is rejected');
reset role;

-- Moving a reply to another conversation is rejected too (the trigger also fires on conversation_id)
select throws_ok($$update public.messages set conversation_id = 'd0000000-0000-4000-8000-000000000071',
                                              session_id = 'bbbbbbbb-0000-4000-8000-000000000071'
                    where id = 'e7100000-0000-4000-8000-000000000003'$$,
  '23514', null, 'moving a reply away from its original is rejected');

-- A soft delete keeps the link; a hard delete clears it
update public.messages set deleted = true where id = 'e7100000-0000-4000-8000-000000000002';
select is((select reply_to from public.messages where id = 'e7100000-0000-4000-8000-000000000003'),
  'e7100000-0000-4000-8000-000000000002'::uuid, 'a soft delete keeps reply_to');
delete from public.messages where id = 'e7100000-0000-4000-8000-000000000002';
select is((select reply_to from public.messages where id = 'e7100000-0000-4000-8000-000000000003'), null,
  'a hard delete sets reply_to to null');
select ok(exists (select 1 from public.messages where id = 'e7100000-0000-4000-8000-000000000003'), 'and the reply survives');

select * from finish();
rollback;
