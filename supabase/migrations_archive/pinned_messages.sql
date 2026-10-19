-- Run this in the Supabase SQL editor

CREATE TABLE IF NOT EXISTS pinned_messages (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid        NOT NULL,
  message_id uuid        NOT NULL,
  pinned_by  uuid        NOT NULL,
  pinned_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel_id, message_id)
);

ALTER TABLE pinned_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read pins"  ON pinned_messages FOR SELECT USING (true);
CREATE POLICY "pin"        ON pinned_messages FOR INSERT WITH CHECK (auth.uid() = pinned_by);
CREATE POLICY "unpin"      ON pinned_messages FOR DELETE  USING (auth.uid() IS NOT NULL);

-- Enable realtime so pin/unpin syncs across all connected clients
ALTER PUBLICATION supabase_realtime ADD TABLE pinned_messages;
