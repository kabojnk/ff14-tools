-- Sub-project 2 (expand): chat data is visible to conversation members only.

-- messages
drop policy if exists "Authenticated users can send messages" on public.messages;
drop policy if exists "Users can edit their own messages" on public.messages;
drop policy if exists "Users can view messages from visible sessions" on public.messages;
drop policy if exists "members read visible messages" on public.messages;
drop policy if exists "members send as themselves" on public.messages;
drop policy if exists "authors edit own messages" on public.messages;
create policy "members read visible messages" on public.messages for select to authenticated
  using (public.is_member(conversation_id)
         and exists (select 1 from public.sessions s where s.id = messages.session_id and s.visible));
create policy "members send as themselves" on public.messages for insert to authenticated
  with check (auth.uid() = author_id and public.is_member(conversation_id));
create policy "authors edit own messages" on public.messages for update to authenticated
  using (auth.uid() = author_id and public.is_member(conversation_id))
  with check (auth.uid() = author_id and public.is_member(conversation_id));

-- sessions (drag/fill go through definer RPCs; no client updates)
drop policy if exists "Authenticated users can create sessions" on public.sessions;
drop policy if exists "Authenticated users can update session visibility" on public.sessions;
drop policy if exists "Authenticated users can view visible sessions" on public.sessions;
drop policy if exists "members read visible sessions" on public.sessions;
drop policy if exists "members start sessions" on public.sessions;
create policy "members read visible sessions" on public.sessions for select to authenticated
  using (visible and public.is_member(conversation_id));
create policy "members start sessions" on public.sessions for insert to authenticated
  with check (visible and public.is_member(conversation_id));

-- pinned_messages
drop policy if exists "read pins" on public.pinned_messages;
drop policy if exists "pin" on public.pinned_messages;
drop policy if exists "unpin" on public.pinned_messages;
drop policy if exists "members read pins" on public.pinned_messages;
drop policy if exists "members pin" on public.pinned_messages;
drop policy if exists "members unpin" on public.pinned_messages;
create policy "members read pins" on public.pinned_messages for select to authenticated
  using (public.is_member(conversation_id));
create policy "members pin" on public.pinned_messages for insert to authenticated
  with check (auth.uid() = pinned_by and public.is_member(conversation_id));
create policy "members unpin" on public.pinned_messages for delete to authenticated
  using (public.is_member(conversation_id));

-- reactions (scoped through the message's conversation)
drop policy if exists "Authenticated users can add reactions" on public.reactions;
drop policy if exists "Authenticated users can view reactions" on public.reactions;
drop policy if exists "Users can remove their own reactions" on public.reactions;
drop policy if exists "members read reactions" on public.reactions;
drop policy if exists "members react as themselves" on public.reactions;
drop policy if exists "users remove own reactions" on public.reactions;
create policy "members read reactions" on public.reactions for select to authenticated
  using (exists (select 1 from public.messages m where m.id = reactions.message_id and public.is_member(m.conversation_id)));
create policy "members react as themselves" on public.reactions for insert to authenticated
  with check (auth.uid() = user_id
              and exists (select 1 from public.messages m where m.id = reactions.message_id and public.is_member(m.conversation_id)));
create policy "users remove own reactions" on public.reactions for delete to authenticated
  using (auth.uid() = user_id);

-- channels (old-app compatibility only): members only; no client updates (renaming/archiving is gone)
drop policy if exists "Authenticated users can create channels" on public.channels;
drop policy if exists "Authenticated users can update channels" on public.channels;
drop policy if exists "Authenticated users can view active channels" on public.channels;
drop policy if exists "members read active channels" on public.channels;
drop policy if exists "members create channels" on public.channels;
create policy "members read active channels" on public.channels for select to authenticated
  using (not archived and public.is_member(conversation_id));
create policy "members create channels" on public.channels for insert to authenticated
  with check (public.is_member(conversation_id));  -- channels_compat fills conversation_id first

-- The old history RPC was SECURITY DEFINER and executable by anon, so it would bypass the policies above.
alter function public.get_channel_messages(uuid, integer, timestamptz) security invoker;
alter function public.get_channel_messages(uuid, integer, timestamptz) set search_path = '';
revoke execute on function public.get_channel_messages(uuid, integer, timestamptz) from public, anon;
grant execute on function public.get_channel_messages(uuid, integer, timestamptz) to authenticated;

-- new tables
drop policy if exists "members read conversations" on public.conversations;
create policy "members read conversations" on public.conversations for select to authenticated
  using (public.is_member(id));

drop policy if exists "members read membership" on public.conversation_members;
create policy "members read membership" on public.conversation_members for select to authenticated
  using (public.is_member(conversation_id));

-- Own position always; someone else's only when BOTH have read receipts on. Writes go through mark_read().
drop policy if exists "read positions per receipts setting" on public.read_positions;
create policy "read positions per receipts setting" on public.read_positions for select to authenticated
  using (
    user_id = auth.uid()
    or (public.is_member(conversation_id)
        and (select p.read_receipts from public.profiles p where p.id = auth.uid())
        and (select p.read_receipts from public.profiles p where p.id = read_positions.user_id))
  );

drop policy if exists "anyone signed in reads statuses" on public.status_definitions;
drop policy if exists "anyone signed in adds statuses" on public.status_definitions;
drop policy if exists "anyone signed in edits statuses" on public.status_definitions;
drop policy if exists "anyone signed in deletes statuses" on public.status_definitions;
create policy "anyone signed in reads statuses" on public.status_definitions for select to authenticated using (true);
create policy "anyone signed in adds statuses" on public.status_definitions for insert to authenticated with check (true);
create policy "anyone signed in edits statuses" on public.status_definitions for update to authenticated using (true) with check (true);
create policy "anyone signed in deletes statuses" on public.status_definitions for delete to authenticated using (true);

-- Realtime Authorization: private channel "conv:<uuid>" is for that conversation's members only.
create or replace function public.topic_conversation(p_topic text)
returns uuid language sql immutable set search_path = '' as $$
  select case when p_topic ~ '^conv:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then substring(p_topic from 6)::uuid end
$$;

drop policy if exists "members receive conversation events" on realtime.messages;
drop policy if exists "members send conversation events" on realtime.messages;
create policy "members receive conversation events" on realtime.messages for select to authenticated
  using (public.is_member(public.topic_conversation(realtime.topic())));
create policy "members send conversation events" on realtime.messages for insert to authenticated
  with check (public.is_member(public.topic_conversation(realtime.topic())));
