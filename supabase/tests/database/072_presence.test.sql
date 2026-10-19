-- Presence storage: the manual override (Away / Invisible) and last seen.
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

select has_column('public', 'profiles', 'presence_override', 'profiles.presence_override exists');
select col_is_null('public', 'profiles', 'presence_override', 'presence_override is nullable');
select col_hasnt_default('public', 'profiles', 'presence_override', 'presence_override defaults to null');
select has_column('public', 'profiles', 'last_seen_at', 'profiles.last_seen_at exists');
select col_type_is('public', 'profiles', 'last_seen_at', 'timestamp with time zone', 'last_seen_at is timestamptz');
select is((select count(*) from public.profiles where presence_override is not null), 0::bigint, 'the seed has no overrides');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok($$update public.profiles set presence_override = 'invisible' where id = auth.uid()$$, 'Alice can go Invisible');
select lives_ok($$update public.profiles set presence_override = 'away' where id = auth.uid()$$, 'Alice can go Away');
select lives_ok($$update public.profiles set presence_override = null where id = auth.uid()$$, 'Alice can clear the override');
select throws_ok($$update public.profiles set presence_override = 'online' where id = auth.uid()$$, '23514', null,
  'only away and invisible are stored');
update public.profiles set presence_override = 'invisible' where id = '22222222-2222-4222-8222-222222222222';
select is((select presence_override from public.profiles where id = '22222222-2222-4222-8222-222222222222'), null,
  'Alice cannot change Bea''s override');

update public.profiles set last_seen_at = null where id = auth.uid();
select lives_ok($$select public.touch_last_seen()$$, 'touch_last_seen');
select is((select last_seen_at from public.profiles where id = auth.uid()), now(), 'touch_last_seen sets last_seen_at = now()');
reset role;

select ok(not has_function_privilege('anon', 'public.touch_last_seen()', 'execute'), 'anon cannot execute touch_last_seen');
select ok(has_function_privilege('authenticated', 'public.touch_last_seen()', 'execute'), 'authenticated can execute touch_last_seen');

select * from finish();
rollback;
