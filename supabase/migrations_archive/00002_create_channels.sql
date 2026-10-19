-- Channels table
create table public.channels (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  archived boolean not null default false,
  position integer not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- Enable RLS
alter table public.channels enable row level security;

-- Policies: authenticated users can see non-archived channels, create, and update
create policy "Authenticated users can view active channels"
  on public.channels for select
  to authenticated
  using (archived = false);

create policy "Authenticated users can create channels"
  on public.channels for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update channels"
  on public.channels for update
  to authenticated
  using (true)
  with check (true);

-- Seed a default 'general' channel
insert into public.channels (name, description, position)
values ('general', 'General discussion', 0);
