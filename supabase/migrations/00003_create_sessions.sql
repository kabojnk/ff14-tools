-- Sessions table: tracks chat buffer sessions per channel for "Change the Sheets"
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  visible boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- Index for fast lookup of visible sessions per channel
create index idx_sessions_channel_visible on public.sessions(channel_id, visible);

-- Enable RLS
alter table public.sessions enable row level security;

-- Policies
create policy "Authenticated users can view visible sessions"
  on public.sessions for select
  to authenticated
  using (visible = true);

create policy "Authenticated users can create sessions"
  on public.sessions for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update session visibility"
  on public.sessions for update
  to authenticated
  using (true)
  with check (true);

-- Create a default session for the 'general' channel
insert into public.sessions (channel_id)
select id from public.channels where name = 'general';

-- RPC function for "Change the Sheets"
create or replace function public.change_sheets(p_channel_id uuid)
returns uuid as $$
declare
  new_session_id uuid;
begin
  -- Hide all existing sessions for this channel
  update public.sessions
  set visible = false
  where channel_id = p_channel_id;

  -- Create a new visible session
  insert into public.sessions (channel_id, created_by, visible)
  values (p_channel_id, auth.uid(), true)
  returning id into new_session_id;

  return new_session_id;
end;
$$ language plpgsql security definer;
