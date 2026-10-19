-- pgTAP smoke test. Pattern every database test copies:
--   begin; create extension pgtap; plan(n); ...
--   set local role authenticated + set local request.jwt.claims to impersonate a user; ...; reset role;
--   finish(); rollback;
-- pgTAP's own bookkeeping works while impersonating `authenticated`, so assertions run directly under the role.
begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

select has_table('public', 'messages', 'baseline schema is loaded');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is(auth.uid(), '11111111-1111-4111-8111-111111111111'::uuid, 'auth.uid() follows the jwt claims');
select ok((select count(*) from public.profiles) >= 3, 'authenticated can read profiles');
reset role;

select * from finish();
rollback;
