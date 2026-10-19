-- Server-side media index: normalisation, rebuilds on insert/edit/delete, gallery filters, visibility, paging.
-- Uses its own conversation (Alice + Bea) so counts don't depend on the seed's media.
begin;
create extension if not exists pgtap with schema extensions;
select plan(37);

-- Normalisation helpers
select is(public.normalize_extension('.ZIP'), 'zip', '".ZIP" → zip');
select is(public.normalize_extension('zip'), 'zip', '"zip" → zip');
select is(public.normalize_extension(' .zip '), 'zip', '" .zip " → zip');
select is(public.normalize_extension('..zip'), 'zip', '"..zip" → zip');
select is(public.normalize_extension('   '), null, 'blank → null');
select is(public.normalize_extension(null), null, 'null → null');
select is(public.file_extension('raid.PMP'), 'pmp', 'raid.PMP → pmp');
select is(public.file_extension('README'), null, 'README → null');
select is(public.file_extension('a.tar.gz'), 'gz', 'a.tar.gz → gz');

-- Fixture
insert into public.conversations (id, created_at) values ('d0000000-0000-4000-8000-000000000050', now() - interval '2 years');
insert into public.conversation_members (conversation_id, user_id) values
  ('d0000000-0000-4000-8000-000000000050', '11111111-1111-4111-8111-111111111111'),
  ('d0000000-0000-4000-8000-000000000050', '22222222-2222-4222-8222-222222222222');
insert into public.sessions (id, conversation_id, visible, created_at) values
  ('bbbbbbbb-0000-4000-8000-000000000051', 'd0000000-0000-4000-8000-000000000050', true,  now() - interval '1 day'),
  ('bbbbbbbb-0000-4000-8000-000000000052', 'd0000000-0000-4000-8000-000000000050', false, now() - interval '2 days');

-- Rebuilds (this message ends deleted, so it contributes no rows to the filter counts below)
insert into public.messages (id, conversation_id, space, session_id, author_id, content, attachments, created_at) values
  ('e5000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000050', 'main',
   'bbbbbbbb-0000-4000-8000-000000000051', '11111111-1111-4111-8111-111111111111',
   'see https://Example.COM/x. ok',
   '[{"url":"https://cdn.test/a.png","type":"image","filename":"a.png","size":10},
     {"url":"https://cdn.test/b.ZIP","type":"file","filename":"b.ZIP","size":20}]',
   now() - interval '20 hours');
select is((select count(*) from public.message_media where message_id = 'e5000000-0000-4000-8000-000000000001'), 3::bigint,
  'two attachments and one link give 3 rows');
select ok(exists (select 1 from public.message_media where message_id = 'e5000000-0000-4000-8000-000000000001'
                   and kind = 'link' and url = 'https://Example.COM/x' and filename = 'example.com'),
  'link: trailing period trimmed, host lowercased');
select is((select extension from public.message_media where message_id = 'e5000000-0000-4000-8000-000000000001' and kind = 'file'),
  'zip', 'attachment extension is lowercased');
update public.messages set content = 'no link any more' where id = 'e5000000-0000-4000-8000-000000000001';
select is((select count(*) from public.message_media where message_id = 'e5000000-0000-4000-8000-000000000001'), 2::bigint,
  'editing out the link leaves 2 rows');
update public.messages set deleted = true where id = 'e5000000-0000-4000-8000-000000000001';
select is((select count(*) from public.message_media where message_id = 'e5000000-0000-4000-8000-000000000001'), 0::bigint,
  'deleting the message removes its rows');

insert into public.messages (id, conversation_id, space, session_id, author_id, content, attachments, created_at) values
  ('e5000000-0000-4000-8000-000000000011', 'd0000000-0000-4000-8000-000000000050', 'main', 'bbbbbbbb-0000-4000-8000-000000000051',
   '11111111-1111-4111-8111-111111111111', null, '[{"url":"https://cdn.test/cat.jpg","type":"image","filename":"cat.jpg","size":1}]', now() - interval '19 hours'),
  ('e5000000-0000-4000-8000-000000000012', 'd0000000-0000-4000-8000-000000000050', 'main', 'bbbbbbbb-0000-4000-8000-000000000051',
   '11111111-1111-4111-8111-111111111111', null, '[{"url":"https://cdn.test/clip.mp4","type":"video","filename":"clip.mp4","size":1}]', now() - interval '18 hours'),
  ('e5000000-0000-4000-8000-000000000013', 'd0000000-0000-4000-8000-000000000050', 'main', 'bbbbbbbb-0000-4000-8000-000000000051',
   '22222222-2222-4222-8222-222222222222', null, '[{"url":"https://gifs.test/d.gif","type":"gif","filename":"dance","size":0}]', now() - interval '17 hours'),
  ('e5000000-0000-4000-8000-000000000014', 'd0000000-0000-4000-8000-000000000050', 'main', 'bbbbbbbb-0000-4000-8000-000000000051',
   '22222222-2222-4222-8222-222222222222', 'raid plan', '[{"url":"https://cdn.test/raid.PMP","type":"file","filename":"raid.PMP","size":1}]', now() - interval '16 hours'),
  ('e5000000-0000-4000-8000-000000000015', 'd0000000-0000-4000-8000-000000000050', 'main', 'bbbbbbbb-0000-4000-8000-000000000051',
   '11111111-1111-4111-8111-111111111111', null, '[{"url":"https://cdn.test/notes.zip","type":"file","filename":"notes.zip","size":1}]', now() - interval '15 hours'),
  ('e5000000-0000-4000-8000-000000000016', 'd0000000-0000-4000-8000-000000000050', 'main', 'bbbbbbbb-0000-4000-8000-000000000051',
   '11111111-1111-4111-8111-111111111111', 'guide: https://example.com/guide', '[]', now() - interval '14 hours'),
  ('e5000000-0000-4000-8000-000000000017', 'd0000000-0000-4000-8000-000000000050', 'schist', 'bbbbbbbb-0000-4000-8000-000000000051',
   '22222222-2222-4222-8222-222222222222', null, '[{"url":"https://cdn.test/rock.png","type":"image","filename":"rock.png","size":1}]', now() - interval '13 hours'),
  ('e5000000-0000-4000-8000-000000000018', 'd0000000-0000-4000-8000-000000000050', 'main', 'bbbbbbbb-0000-4000-8000-000000000052',
   '22222222-2222-4222-8222-222222222222', null, '[{"url":"https://cdn.test/secret.png","type":"image","filename":"secret.png","size":1}]', now() - interval '36 hours'),
  -- newest: two attachments on one message, for paging
  ('e5000000-0000-4000-8000-000000000019', 'd0000000-0000-4000-8000-000000000050', 'main', 'bbbbbbbb-0000-4000-8000-000000000051',
   '11111111-1111-4111-8111-111111111111', null,
   '[{"url":"https://cdn.test/p1.zip","type":"file","filename":"p1.zip","size":1},
     {"url":"https://cdn.test/p2.zip","type":"file","filename":"p2.zip","size":1}]', now() - interval '1 hour');

-- Alice (member)
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is((select count(*) from public.get_media('d0000000-0000-4000-8000-000000000050')), 9::bigint, 'all visible media');
select is((select count(*) from public.get_media('d0000000-0000-4000-8000-000000000050', p_kinds => array['image'])), 2::bigint, 'images');
select is((select count(*) from public.get_media('d0000000-0000-4000-8000-000000000050', p_kinds => array['video'])), 1::bigint, 'videos');
select is((select count(*) from public.get_media('d0000000-0000-4000-8000-000000000050', p_kinds => array['gif'])), 1::bigint, 'gifs');
select is((select count(*) from public.get_media('d0000000-0000-4000-8000-000000000050', p_kinds => array['file'])), 4::bigint, 'files');
select is((select count(*) from public.get_media('d0000000-0000-4000-8000-000000000050', p_kinds => array['link'])), 1::bigint, 'links');
select is((select count(*) from public.get_media('d0000000-0000-4000-8000-000000000050', p_kinds => array['audio'])), 0::bigint, 'voice (reserved)');
select is((select count(*) from public.get_media('d0000000-0000-4000-8000-000000000050', p_kinds => array['image', 'video'])), 3::bigint,
  'several kinds at once');
select is((select count(*) from public.get_media('d0000000-0000-4000-8000-000000000050', p_space => 'main')), 8::bigint, 'Main only');
select is((select count(*) from public.get_media('d0000000-0000-4000-8000-000000000050', p_space => 'schist')), 1::bigint, 'Schist only');
select is((select count(*) from public.get_media('d0000000-0000-4000-8000-000000000050', p_extension => 'zip')), 3::bigint, 'extension zip');
select results_eq(
  $$select id from public.get_media('d0000000-0000-4000-8000-000000000050', p_extension => '.ZIP')$$,
  $$select id from public.get_media('d0000000-0000-4000-8000-000000000050', p_extension => 'zip')$$,
  '".ZIP" gives the same rows as "zip"');
select results_eq(
  $$select id from public.get_media('d0000000-0000-4000-8000-000000000050', p_extension => ' .zip ')$$,
  $$select id from public.get_media('d0000000-0000-4000-8000-000000000050', p_extension => 'zip')$$,
  '" .zip " gives the same rows as "zip"');
select is((select filename from public.get_media('d0000000-0000-4000-8000-000000000050', p_extension => 'PMP')), 'raid.PMP',
  'PMP finds raid.PMP');
select is((select count(*) from public.get_media('d0000000-0000-4000-8000-000000000050', p_extension => '  ')), 9::bigint,
  'a blank extension filters nothing');
select is((select count(*) from public.message_media where message_id = 'e5000000-0000-4000-8000-000000000018'), 0::bigint,
  'hidden-session media is invisible');
select is((select link.filename from public.get_media('d0000000-0000-4000-8000-000000000050', p_kinds => array['link']) link),
  'example.com', 'links carry the host');

-- Paging: two attachments on the newest message, one per page
select set_config('test.p1', (select id::text from public.get_media('d0000000-0000-4000-8000-000000000050', p_limit => 1)), true);
select set_config('test.p1_at', (select created_at::text from public.get_media('d0000000-0000-4000-8000-000000000050', p_limit => 1)), true);
select is((select message_id from public.get_media('d0000000-0000-4000-8000-000000000050', p_limit => 1)),
  'e5000000-0000-4000-8000-000000000019'::uuid, 'page 1 starts with the newest message');
select is((select message_id from public.get_media('d0000000-0000-4000-8000-000000000050',
            p_before => current_setting('test.p1_at')::timestamptz, p_before_id => current_setting('test.p1')::uuid, p_limit => 1)),
  'e5000000-0000-4000-8000-000000000019'::uuid, 'page 2 returns the same message''s other attachment');
select isnt((select id from public.get_media('d0000000-0000-4000-8000-000000000050',
            p_before => current_setting('test.p1_at')::timestamptz, p_before_id => current_setting('test.p1')::uuid, p_limit => 1)),
  current_setting('test.p1')::uuid, 'and it is a different row');
reset role;

-- Cleo (not a member)
set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select is((select count(*) from public.get_media('d0000000-0000-4000-8000-000000000050')), 0::bigint, 'Cleo gets no media');
select is((select count(*) from public.message_media), 0::bigint, 'Cleo sees no media rows');
reset role;

select ok(not has_function_privilege('anon', 'public.get_media(uuid, text, text[], text, timestamptz, uuid, integer)', 'execute'),
  'anon cannot execute get_media');

select * from finish();
rollback;
