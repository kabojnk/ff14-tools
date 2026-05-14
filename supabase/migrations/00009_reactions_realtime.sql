-- Allow Supabase Realtime DELETE events to carry the old row data,
-- which is required to identify which reaction was removed.
alter table public.reactions replica identity full;
