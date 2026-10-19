-- Custom emoji table
create table public.custom_emoji (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  image_url text not null,
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- Enable RLS
alter table public.custom_emoji enable row level security;

create policy "Authenticated users can view custom emoji"
  on public.custom_emoji for select
  to authenticated
  using (true);

create policy "Authenticated users can upload custom emoji"
  on public.custom_emoji for insert
  to authenticated
  with check (true);

create policy "Authenticated users can delete custom emoji"
  on public.custom_emoji for delete
  to authenticated
  using (true);
