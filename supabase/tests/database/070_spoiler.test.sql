-- Spoiler marking after posting: set_attachment_spoiler, the message_media flag, and safe parsing.
-- Uses the seed: Alice's image cccc…0011, Bea's video cccc…0012 and file cccc…0014 in conversation d000…0001.
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

-- Fixtures (as postgres): a hidden-session image, a deleted image, a non-object attachment.
insert into public.messages (id, conversation_id, space, session_id, author_id, content, attachments, created_at) values
  ('e7000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'main', 'bbbbbbbb-0000-4000-8000-000000000002',
   '11111111-1111-4111-8111-111111111111', null, '[{"url":"https://cdn.test/hidden.png","type":"image","filename":"hidden.png"}]', now() - interval '2 days'),
  ('e7000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001', 'main', 'bbbbbbbb-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-111111111111', null, '[{"url":"https://cdn.test/gone.png","type":"image","filename":"gone.png"}]', now() - interval '30 seconds'),
  ('e7000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000001', 'main', 'bbbbbbbb-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-111111111111', 'odd', '["just a string"]', now() - interval '20 seconds');
update public.messages set deleted = true where id = 'e7000000-0000-4000-8000-000000000002';

-- Safe parsing of the flag
select lives_ok($$insert into public.messages (id, conversation_id, space, session_id, author_id, attachments) values
  ('e7000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000001', 'main', 'bbbbbbbb-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-111111111111', '[{"url":"https://cdn.test/weird.png","type":"image","spoiler":"yes"},
                                            {"url":"https://cdn.test/s.png","type":"image","spoiler":true}]')$$,
  'a malformed spoiler value never breaks an insert');
select is((select spoiler from public.message_media where url = 'https://cdn.test/weird.png'), false, 'a malformed spoiler value reads as false');
select is((select spoiler from public.message_media where url = 'https://cdn.test/s.png'), true, 'spoiler: true is indexed');

select set_config('test.before', (select row(content, edited_at, created_at)::text from public.messages
                                    where id = 'cccccccc-0000-4000-8000-000000000011'), true);

-- Bea marks Alice's image
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select lives_ok($$select public.set_attachment_spoiler('cccccccc-0000-4000-8000-000000000011', 0, true)$$,
  'Bea (not the author) can mark Alice''s image as a spoiler');
select is((select attachments->0->>'spoiler' from public.messages where id = 'cccccccc-0000-4000-8000-000000000011'), 'true',
  'the attachment carries spoiler = true');
select is((select row(content, edited_at, created_at)::text from public.messages where id = 'cccccccc-0000-4000-8000-000000000011'),
  current_setting('test.before'), 'content and edited_at are unchanged');
select is((select spoiler from public.message_media where url = 'http://cdn.test.local/media/test-image.png'), true,
  'the media row is flagged');
select is((select attachments->0->>'url' from public.messages where id = 'cccccccc-0000-4000-8000-000000000011'),
  'http://cdn.test.local/media/test-image.png', 'the rest of the attachment is kept');
select lives_ok($$select public.set_attachment_spoiler('cccccccc-0000-4000-8000-000000000011', 0, false)$$, 'unmark');
select is((select attachments->0->>'spoiler' from public.messages where id = 'cccccccc-0000-4000-8000-000000000011'), 'false',
  'unmarking reverses the attachment flag');
select is((select spoiler from public.message_media where url = 'http://cdn.test.local/media/test-image.png'), false,
  'unmarking reverses the media flag');
select lives_ok($$select public.set_attachment_spoiler('cccccccc-0000-4000-8000-000000000012', 0, true)$$, 'a video can be marked');

-- Bad input
select throws_ok($$select public.set_attachment_spoiler('cccccccc-0000-4000-8000-000000000011', -1, true)$$, '22023', null, 'index -1');
select throws_ok($$select public.set_attachment_spoiler('cccccccc-0000-4000-8000-000000000011', 1, true)$$, '22023', null, 'index past the end');
select throws_ok($$select public.set_attachment_spoiler('cccccccc-0000-4000-8000-000000000011', null, true)$$, '22023', null, 'null index');
select throws_ok($$select public.set_attachment_spoiler('cccccccc-0000-4000-8000-000000000011', 0, null)$$, '22023', null, 'null flag');
select throws_ok($$select public.set_attachment_spoiler('e7000000-0000-4000-8000-000000000002', 0, true)$$, '22023', null, 'a deleted message');
select throws_ok($$select public.set_attachment_spoiler('e7000000-0000-4000-8000-000000000001', 0, true)$$, '22023', null,
  'a message in a hidden (dragged) session');
select throws_ok($$select public.set_attachment_spoiler('cccccccc-0000-4000-8000-000000000014', 0, true)$$, '22023', null,
  'a file attachment cannot be a spoiler');
select throws_ok($$select public.set_attachment_spoiler('e7000000-0000-4000-8000-000000000003', 0, true)$$, '22023', null,
  'a non-object attachment');
select throws_ok($$select public.set_attachment_spoiler('cccccccc-0000-4000-8000-0000000000ff', 0, true)$$, '22023', null,
  'an unknown message');
reset role;

-- Cleo (not a member)
set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select throws_ok($$select public.set_attachment_spoiler('cccccccc-0000-4000-8000-000000000011', 0, true)$$, '42501', null,
  'Cleo cannot mark media in a conversation she is not in');
reset role;

select ok(not has_function_privilege('anon', 'public.set_attachment_spoiler(uuid, integer, boolean)', 'execute'), 'anon cannot execute');
select ok(has_function_privilege('authenticated', 'public.set_attachment_spoiler(uuid, integer, boolean)', 'execute'), 'authenticated can execute');
select col_default_is('public', 'message_media', 'spoiler', 'false', 'message_media.spoiler defaults to false');

select * from finish();
rollback;
