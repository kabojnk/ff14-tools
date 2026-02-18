-- Messages table
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  content text,
  attachments jsonb not null default '[]'::jsonb,
  type text not null default 'text' check (type in ('text', 'gif', 'system')),
  edited_at timestamptz,
  deleted boolean not null default false,
  created_at timestamptz not null default now()
);

-- Indexes for efficient message retrieval
create index idx_messages_channel_created on public.messages(channel_id, created_at);
create index idx_messages_session_created on public.messages(session_id, created_at);

-- Enable RLS
alter table public.messages enable row level security;

-- Select: can see messages from visible sessions only
create policy "Users can view messages from visible sessions"
  on public.messages for select
  to authenticated
  using (
    exists (
      select 1 from public.sessions
      where sessions.id = messages.session_id
      and sessions.visible = true
    )
  );

-- Insert: authenticated users can send messages
create policy "Authenticated users can send messages"
  on public.messages for insert
  to authenticated
  with check (auth.uid() = author_id);

-- Update: users can edit their own messages
create policy "Users can edit their own messages"
  on public.messages for update
  to authenticated
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);

-- RPC to get messages for a channel (respects session visibility)
create or replace function public.get_channel_messages(
  p_channel_id uuid,
  p_limit integer default 50,
  p_before timestamptz default null
)
returns setof public.messages as $$
begin
  return query
    select m.*
    from public.messages m
    inner join public.sessions s on s.id = m.session_id
    where m.channel_id = p_channel_id
      and s.visible = true
      and m.deleted = false
      and (p_before is null or m.created_at < p_before)
    order by m.created_at desc
    limit p_limit;
end;
$$ language plpgsql security definer;
