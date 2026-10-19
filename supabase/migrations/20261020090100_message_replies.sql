-- Sub-project 3a (expand): persist which message a message replies to (same conversation only).
alter table public.messages add column if not exists reply_to uuid references public.messages(id) on delete set null;
create index if not exists messages_reply_to_idx on public.messages (reply_to) where reply_to is not null;

create or replace function public.messages_reply_check() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.reply_to is not null and not exists (
       select 1 from public.messages o where o.id = new.reply_to and o.conversation_id = new.conversation_id) then
    raise exception 'a reply must point at a message in the same conversation' using errcode = '23514';
  end if;
  return new;
end $$;
revoke execute on function public.messages_reply_check() from public, anon, authenticated;
drop trigger if exists messages_reply_check on public.messages;
-- Runs after messages_compat has filled conversation_id (BEFORE triggers fire alphabetically: compat < reply).
create trigger messages_reply_check before insert or update of reply_to, conversation_id on public.messages
  for each row execute function public.messages_reply_check();
