-- Sub-project 2 (expand): conversations, spaces, read positions, statuses, secrets.
-- Additive only. Old columns stay until the contract migration.

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  title text,
  archived boolean not null default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index if not exists conversation_members_user_idx on public.conversation_members (user_id);

-- Spaces: exactly two per conversation, never more.
alter table public.channels add column if not exists conversation_id uuid references public.conversations(id);
alter table public.channels add column if not exists space text;
alter table public.channels drop constraint if exists channels_space_check;
alter table public.channels add constraint channels_space_check check (space in ('main', 'schist'));

alter table public.messages add column if not exists conversation_id uuid references public.conversations(id) on delete cascade;
alter table public.messages add column if not exists space text;
alter table public.messages drop constraint if exists messages_space_check;
alter table public.messages add constraint messages_space_check check (space in ('main', 'schist'));
alter table public.messages drop constraint if exists messages_space_required;
alter table public.messages add constraint messages_space_required check (conversation_id is null or space is not null);
alter table public.messages alter column channel_id drop not null;
create index if not exists messages_conv_space_created_idx on public.messages (conversation_id, space, created_at desc);

alter table public.sessions add column if not exists conversation_id uuid references public.conversations(id) on delete cascade;
alter table public.sessions alter column channel_id drop not null;
create index if not exists sessions_conv_visible_created_idx on public.sessions (conversation_id, visible, created_at desc);

alter table public.pinned_messages add column if not exists conversation_id uuid references public.conversations(id) on delete cascade;
alter table public.pinned_messages alter column channel_id drop not null;
create index if not exists pinned_messages_conv_idx on public.pinned_messages (conversation_id);

-- Read positions (one row per person per space)
create table if not exists public.read_positions (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  space text not null check (space in ('main', 'schist')),
  last_read_at timestamptz not null,
  primary key (conversation_id, user_id, space)
);

-- Shared custom statuses
create table if not exists public.status_definitions (
  id uuid primary key default gen_random_uuid(),
  label text not null check (char_length(btrim(label)) between 1 and 40),
  color text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  position integer not null default 0,
  legacy_key text unique,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists status_definitions_updated_at on public.status_definitions;
create trigger status_definitions_updated_at before update on public.status_definitions
  for each row execute function public.handle_updated_at();

insert into public.status_definitions (label, color, position, legacy_key) values
  ('Under Close Watch', '#ef4444', 0, 'under_close_watch'),
  ('Found Out',         '#a855f7', 1, 'found_out'),
  ('You can call me',   '#3b82f6', 2, 'you_can_call'),
  ('Potential Eep',     '#14b8a6', 3, 'potential_eep')
on conflict (legacy_key) do nothing;

alter table public.profiles add column if not exists status_id uuid references public.status_definitions(id) on delete set null;
alter table public.profiles add column if not exists read_receipts boolean not null default true;
alter table public.profiles add column if not exists lock_pin_length smallint;
alter table public.profiles drop constraint if exists profiles_lock_pin_length_check;
alter table public.profiles add constraint profiles_lock_pin_length_check check (lock_pin_length between 4 and 6);

-- Secrets: unreadable by any client role. Only security-definer functions touch these.
create table if not exists public.private_pins (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  pin_hash text not null
);
create table if not exists public.private_secrets (
  key text primary key,
  value_hash text not null
);
alter table public.private_pins enable row level security;
alter table public.private_secrets enable row level security;
revoke all on table public.private_pins from anon, authenticated;
revoke all on table public.private_secrets from anon, authenticated;

-- Lake password: bcrypt of the agreed starting value. The plain word is deliberately not in the repo.
insert into public.private_secrets (key, value_hash)
values ('lake_password', '$2a$10$SgQwNmWG7T6Zt9Bb1TGNSuWQIOWNVEJP4nmJy87KlcaElG.mr18DS')
on conflict (key) do nothing;

alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.read_positions enable row level security;
alter table public.status_definitions enable row level security;

-- Membership check used by every policy. Definer + empty search_path avoids policy recursion and hijacking.
create or replace function public.is_member(p_conversation uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.conversation_members m
    where m.conversation_id = p_conversation and m.user_id = auth.uid()
  )
$$;
revoke execute on function public.is_member(uuid) from public, anon;
grant execute on function public.is_member(uuid) to authenticated;

-- Removing a reaction must carry the row in realtime events.
alter table public.reactions replica identity full;

do $$
declare t text;
begin
  foreach t in array array['conversations', 'conversation_members', 'read_positions', 'status_definitions', 'sessions'] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
