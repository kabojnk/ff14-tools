-- Expand schema: new tables, new columns, secrets unreadable by clients, legacy statuses seeded.
begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

select has_table('public', 'conversations', 'conversations table exists');
select has_table('public', 'conversation_members', 'conversation_members table exists');
select has_table('public', 'read_positions', 'read_positions table exists');
select has_table('public', 'status_definitions', 'status_definitions table exists');
select has_table('public', 'private_pins', 'private_pins table exists');
select has_table('public', 'private_secrets', 'private_secrets table exists');

-- New columns are nullable during expand (triggers fill them)
select col_is_null('public', 'messages', 'conversation_id', 'messages.conversation_id is nullable');
select col_is_null('public', 'messages', 'space', 'messages.space is nullable');
select col_is_null('public', 'sessions', 'conversation_id', 'sessions.conversation_id is nullable');
select col_is_null('public', 'pinned_messages', 'conversation_id', 'pinned_messages.conversation_id is nullable');
select col_is_null('public', 'channels', 'conversation_id', 'channels.conversation_id is nullable');
select col_is_null('public', 'channels', 'space', 'channels.space is nullable');
select col_is_null('public', 'profiles', 'status_id', 'profiles.status_id is nullable');
select col_is_null('public', 'profiles', 'lock_pin_length', 'profiles.lock_pin_length is nullable');
select col_not_null('public', 'profiles', 'read_receipts', 'profiles.read_receipts is not null');
select col_default_is('public', 'profiles', 'read_receipts', 'true', 'read receipts default on');
select col_not_null('public', 'read_positions', 'last_read_at', 'read_positions.last_read_at is not null');

-- channel_id no longer required, so the new app never depends on a channel row
select col_is_null('public', 'messages', 'channel_id', 'messages.channel_id is nullable');
select col_is_null('public', 'sessions', 'channel_id', 'sessions.channel_id is nullable');
select col_is_null('public', 'pinned_messages', 'channel_id', 'pinned_messages.channel_id is nullable');

select has_function('public', 'is_member', array['uuid'], 'is_member(uuid) exists');
select ok(not has_function_privilege('anon', 'public.is_member(uuid)', 'execute'), 'anon cannot execute is_member');

-- Legacy statuses
select results_eq(
  $$select legacy_key, label, color from public.status_definitions where legacy_key is not null order by position$$,
  $$values ('under_close_watch', 'Under Close Watch', '#ef4444'),
           ('found_out', 'Found Out', '#a855f7'),
           ('you_can_call', 'You can call me', '#3b82f6'),
           ('potential_eep', 'Potential Eep', '#14b8a6')$$,
  'four legacy statuses are seeded with the StatusPicker labels and colours');
select throws_ok($$insert into public.status_definitions (label, color) values ('x', 'red')$$,
  '23514', null, 'status colour must be hex');

select ok(exists (select 1 from public.private_secrets where key = 'lake_password'), 'lake password row exists');

-- Secrets are unreadable from client roles
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select throws_ok($$select * from public.private_pins$$, '42501', null, 'authenticated cannot read private_pins');
select throws_ok($$select * from public.private_secrets$$, '42501', null, 'authenticated cannot read private_secrets');
reset role;
set local role anon;
select throws_ok($$select * from public.private_secrets$$, '42501', null, 'anon cannot read private_secrets');
reset role;

select ok(exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sessions'),
  'sessions is in the realtime publication');

select * from finish();
rollback;
