-- Reactions table
create table public.reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  emoji text not null,
  created_at timestamptz not null default now(),
  -- One reaction per emoji per user per message
  unique (message_id, user_id, emoji)
);

-- Index for looking up reactions by message
create index idx_reactions_message on public.reactions(message_id);

-- Enable RLS
alter table public.reactions enable row level security;

create policy "Authenticated users can view reactions"
  on public.reactions for select
  to authenticated
  using (true);

create policy "Authenticated users can add reactions"
  on public.reactions for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can remove their own reactions"
  on public.reactions for delete
  to authenticated
  using (auth.uid() = user_id);
