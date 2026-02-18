-- Settings table: app-wide key-value store
create table public.settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

-- Enable RLS
alter table public.settings enable row level security;

create policy "Authenticated users can view settings"
  on public.settings for select
  to authenticated
  using (true);

create policy "Authenticated users can update settings"
  on public.settings for update
  to authenticated
  using (true)
  with check (true);

-- Seed the eep passphrase (change this to your desired passphrase)
insert into public.settings (key, value)
values ('eep_passphrase', 'the_epic_of_alexander');
