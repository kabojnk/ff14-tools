-- Voice memos: who played what (read-receipts rule), the membership-checked writer, live updates, gallery length.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

-- Seed: conversation d000…0001 (Alice 1111…, Bea 2222…; Cleo 3333… is not a member), visible session bbbb…0001.
insert into public.messages (id, conversation_id, space, session_id, author_id, content, attachments, type) values
  ('e0000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-000000000001', 'main', 'bbbbbbbb-0000-4000-8000-000000000001',
   '22222222-2222-4222-8222-222222222222', null,
   '[{"url":"http://cdn.test.local/voice/a.m4a","type":"audio","filename":"voice-a.m4a","size":1000,"spoiler":false,"duration_ms":42150,"peaks":[0,50,100]}]', 'text'),
  ('e0000000-0000-4000-8000-00000000000b', 'd0000000-0000-4000-8000-000000000001', 'main', 'bbbbbbbb-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-111111111111', null,
   '[{"url":"http://cdn.test.local/voice/b.m4a","type":"audio","filename":"voice-b.m4a","size":1000,"spoiler":false,"duration_ms":1000}]', 'text'),
  ('e0000000-0000-4000-8000-00000000000c', 'd0000000-0000-4000-8000-000000000001', 'main', 'bbbbbbbb-0000-4000-8000-000000000001',
   '22222222-2222-4222-8222-222222222222', 'just text', '[]', 'text');
update public.profiles set read_receipts = true
 where id in ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222');

-- Shape
select has_table('public', 'voice_plays', 'voice_plays exists');
select policies_are('public', 'voice_plays', array['voice plays per receipts setting'], 'voice_plays has only the select policy');
select ok(exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'voice_plays'),
  'voice_plays is in the supabase_realtime publication');
select has_column('public', 'message_media', 'duration_ms', 'message_media has duration_ms');
select ok(not has_function_privilege('anon', 'public.mark_voice_played(uuid)', 'execute'), 'anon cannot mark plays');
select is((select duration_ms from public.message_media where message_id = 'e0000000-0000-4000-8000-00000000000a'),
  42150, 'the trigger copies duration_ms from the attachment');

-- As Alice
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is((select duration_ms from public.get_media('d0000000-0000-4000-8000-000000000001', 'main', array['audio'])
            where message_id = 'e0000000-0000-4000-8000-00000000000a'),
  42150, 'get_media returns duration_ms');
select lives_ok($$ select public.mark_voice_played('e0000000-0000-4000-8000-00000000000a') $$, 'Alice marks Bea''s memo played');
select lives_ok($$ select public.mark_voice_played('e0000000-0000-4000-8000-00000000000a') $$, 'marking again is fine');
select is((select count(*) from public.voice_plays where message_id = 'e0000000-0000-4000-8000-00000000000a'),
  1::bigint, 'marking twice keeps one row');
select throws_ok($$ select public.mark_voice_played('e0000000-0000-4000-8000-00000000000b') $$,
  '22023', null, 'Alice cannot mark her own memo');
select throws_ok($$ select public.mark_voice_played('e0000000-0000-4000-8000-00000000000c') $$,
  '22023', null, 'a message without audio is refused');
select throws_ok($$ insert into public.voice_plays (message_id, user_id)
                    values ('e0000000-0000-4000-8000-00000000000c', '11111111-1111-4111-8111-111111111111') $$,
  '42501', null, 'no direct writes');
reset role;

-- As Cleo (not a member)
set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select throws_ok($$ select public.mark_voice_played('e0000000-0000-4000-8000-00000000000a') $$,
  '42501', null, 'a non-member is refused');
reset role;

-- As Bea: Alice's play, both settings on
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is((select count(*) from public.voice_plays), 1::bigint, 'on/on: Bea sees that Alice played her memo');
reset role;

-- Bea turns receipts off: she no longer sees it; Alice still sees her own
update public.profiles set read_receipts = false where id = '22222222-2222-4222-8222-222222222222';
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is((select count(*) from public.voice_plays), 0::bigint, 'Bea off: she cannot see Alice''s play');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is((select count(*) from public.voice_plays), 1::bigint, 'Alice always sees her own play');
reset role;

-- Alice off, Bea on: Bea still can't see it
update public.profiles set read_receipts = true where id = '22222222-2222-4222-8222-222222222222';
update public.profiles set read_receipts = false where id = '11111111-1111-4111-8111-111111111111';
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is((select count(*) from public.voice_plays), 0::bigint, 'Alice off: Bea cannot see Alice''s play');
reset role;

-- Deleting the message removes its plays
delete from public.messages where id = 'e0000000-0000-4000-8000-00000000000a';
select is((select count(*) from public.voice_plays), 0::bigint, 'deleting a memo deletes its plays');

select * from finish();
rollback;
