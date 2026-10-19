-- Read positions: your own row always; someone else's only when BOTH people have read receipts on.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

-- Uses the seed: conversation d000…0001 (Alice + Bea), general (main) + schist channels, session bbbb…0001.
delete from public.read_positions;
insert into public.read_positions (conversation_id, user_id, space, last_read_at) values
  ('d0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'main', now()),
  ('d0000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'main', now());

create function pg_temp.alice_sees(p_owner uuid) returns bigint language sql as $$
  select count(*) from public.read_positions where user_id = p_owner
$$;
grant execute on function pg_temp.alice_sees(uuid) to authenticated;

create function pg_temp.receipts(p_alice boolean, p_bea boolean) returns void language sql as $$
  update public.profiles set read_receipts = p_alice where id = '11111111-1111-4111-8111-111111111111';
  update public.profiles set read_receipts = p_bea where id = '22222222-2222-4222-8222-222222222222';
$$;

-- both on
select pg_temp.receipts(true, true);
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is(pg_temp.alice_sees('11111111-1111-4111-8111-111111111111'), 1::bigint, 'on/on: Alice sees her own row');
select is(pg_temp.alice_sees('22222222-2222-4222-8222-222222222222'), 1::bigint, 'on/on: Alice sees Bea''s row');
reset role;

-- Alice on, Bea off
select pg_temp.receipts(true, false);
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is(pg_temp.alice_sees('11111111-1111-4111-8111-111111111111'), 1::bigint, 'on/off: Alice sees her own row');
select is(pg_temp.alice_sees('22222222-2222-4222-8222-222222222222'), 0::bigint, 'on/off: Alice cannot see Bea''s row');
reset role;

-- Alice off, Bea on
select pg_temp.receipts(false, true);
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is(pg_temp.alice_sees('11111111-1111-4111-8111-111111111111'), 1::bigint, 'off/on: Alice sees her own row');
select is(pg_temp.alice_sees('22222222-2222-4222-8222-222222222222'), 0::bigint, 'off/on: Alice cannot see Bea''s row');
reset role;

-- both off
select pg_temp.receipts(false, false);
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is(pg_temp.alice_sees('11111111-1111-4111-8111-111111111111'), 1::bigint, 'off/off: Alice sees her own row');
select is(pg_temp.alice_sees('22222222-2222-4222-8222-222222222222'), 0::bigint, 'off/off: Alice cannot see Bea''s row');
reset role;

-- A non-member sees nobody's position
select pg_temp.receipts(true, true);
set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select is((select count(*) from public.read_positions), 0::bigint, 'Cleo sees no read positions');
reset role;

select * from finish();
rollback;
