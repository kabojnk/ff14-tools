-- Custom emoji: name format for new names, the adder is the signed-in user, live updates.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- Shape
select ok(exists (select 1 from pg_constraint
                  where conrelid = 'public.custom_emoji'::regclass and conname = 'custom_emoji_name_format'),
  'custom_emoji_name_format exists');
select ok(not (select convalidated from pg_constraint
               where conrelid = 'public.custom_emoji'::regclass and conname = 'custom_emoji_name_format'),
  'the name format is NOT VALID, so existing rows are never re-checked');
select policies_are('public', 'custom_emoji', array[
  'Authenticated users can view custom emoji',
  'Authenticated users can delete custom emoji',
  'Members add their own custom emoji'
], 'custom_emoji policies: view, delete, and the new insert policy');
select ok(not exists (select 1 from pg_policies
                      where schemaname = 'public' and tablename = 'custom_emoji'
                        and policyname = 'Authenticated users can upload custom emoji'),
  'the old insert policy is gone');
select ok(exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'custom_emoji'),
  'custom_emoji is in the supabase_realtime publication');
select col_default_is('public', 'custom_emoji', 'uploaded_by', 'auth.uid()', 'uploaded_by defaults to auth.uid()');

-- As Alice
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

select lives_ok($$insert into public.custom_emoji (name, image_url, uploaded_by)
                  values ('moogle_wave', 'http://cdn.test.local/emoji/w.png', '11111111-1111-4111-8111-111111111111')$$,
  'Alice can add an emoji as herself');
select lives_ok($$insert into public.custom_emoji (name, image_url) values ('kupo_2', 'http://cdn.test.local/emoji/k.png')$$,
  'leaving the adder out still passes (the default fills it)');
select is((select uploaded_by from public.custom_emoji where name = 'kupo_2'),
  '11111111-1111-4111-8111-111111111111'::uuid, 'the default adder is the signed-in user');
select throws_ok($$insert into public.custom_emoji (name, image_url, uploaded_by)
                   values ('as_bea', 'http://cdn.test.local/emoji/b.png', '22222222-2222-4222-8222-222222222222')$$,
  '42501', null, 'Alice cannot add an emoji as Bea');
select throws_ok($$insert into public.custom_emoji (name, image_url) values ('Moogle', 'http://x/1.png')$$,
  '23514', null, 'upper-case names are rejected');
select throws_ok($$insert into public.custom_emoji (name, image_url) values ('a', 'http://x/2.png')$$,
  '23514', null, 'one-character names are rejected');
select throws_ok($$insert into public.custom_emoji (name, image_url) values (repeat('a', 33), 'http://x/3.png')$$,
  '23514', null, '33-character names are rejected');
select throws_ok($$insert into public.custom_emoji (name, image_url) values ('moogle_wave', 'http://x/4.png')$$,
  '23505', null, 'a duplicate name is rejected');

-- As Bea: any member can delete
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select lives_ok($$delete from public.custom_emoji where name = 'moogle_wave'$$, 'Bea can delete Alice''s emoji');
reset role;
select is((select count(*) from public.custom_emoji where name = 'moogle_wave'), 0::bigint, 'the emoji is gone');

select * from finish();
rollback;
