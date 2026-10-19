SET local check_function_bodies = off;

CREATE SEQUENCE "public"."hunt_communiques_id_seq" AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE;

CREATE TABLE "public"."channels" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "name"        text                     NOT NULL,
  "description" text,
  "archived"    boolean                  NOT NULL DEFAULT false,
  "position"    integer                  NOT NULL DEFAULT 0,
  "created_by"  uuid,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "channels_name_key" UNIQUE (name),
  CONSTRAINT "channels_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."channels"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."custom_emoji" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "name"        text                     NOT NULL,
  "image_url"   text                     NOT NULL,
  "uploaded_by" uuid,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "custom_emoji_name_key" UNIQUE (name),
  CONSTRAINT "custom_emoji_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."custom_emoji"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."hunt_communiques" (
  "id"        bigint                   NOT NULL DEFAULT nextval('public.hunt_communiques_id_seq'::regclass),
  "timestamp" timestamp with time zone NOT NULL,
  "sender"    text                     NOT NULL,
  "recipient" text,
  "channel"   text                     NOT NULL,
  "message"   text                     NOT NULL,
  CONSTRAINT "hunt_communiques_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."hunt_communiques"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."messages" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "channel_id"  uuid                     NOT NULL,
  "session_id"  uuid                     NOT NULL,
  "author_id"   uuid                     NOT NULL,
  "content"     text,
  "attachments" jsonb                    NOT NULL DEFAULT '[]'::jsonb,
  "type"        text                     NOT NULL DEFAULT 'text'::text,
  "edited_at"   timestamp with time zone,
  "deleted"     boolean                  NOT NULL DEFAULT false,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "messages_pkey" PRIMARY KEY (id),
  CONSTRAINT "messages_type_check" CHECK ((type = ANY (ARRAY['text'::text, 'gif'::text, 'system'::text])))
);

ALTER TABLE "public"."messages"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."pinned_messages" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "channel_id" uuid                     NOT NULL,
  "message_id" uuid                     NOT NULL,
  "pinned_by"  uuid                     NOT NULL,
  "pinned_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "pinned_messages_channel_id_message_id_key" UNIQUE (channel_id, message_id),
  CONSTRAINT "pinned_messages_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."pinned_messages"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."profiles" (
  "id"                  uuid                     NOT NULL,
  "nickname"            text                     NOT NULL,
  "avatar_url"          text,
  "profile_message"     text,
  "status"              text                     NOT NULL DEFAULT 'offline'::text,
  "custom_status_text"  text,
  "custom_status_emoji" text,
  "created_at"          timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"          timestamp with time zone NOT NULL DEFAULT now(),
  "lock_pin"            text,
  "banner_url"          text,
  CONSTRAINT "profiles_pkey" PRIMARY KEY (id),
  CONSTRAINT "profiles_status_check"
    CHECK ((status = ANY (ARRAY['online'::text, 'away'::text, 'offline'::text, 'under_close_watch'::text, 'found_out'::text, 'you_can_call'::text, 'potential_eep'::text])))
);

ALTER TABLE "public"."profiles"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."reactions" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "message_id" uuid                     NOT NULL,
  "user_id"    uuid                     NOT NULL,
  "emoji"      text                     NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "reactions_message_id_user_id_emoji_key" UNIQUE (message_id, user_id, emoji),
  CONSTRAINT "reactions_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."reactions"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."sessions" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "channel_id" uuid                     NOT NULL,
  "visible"    boolean                  NOT NULL DEFAULT true,
  "created_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "sessions_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."sessions"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."settings" (
  "key"        text                     NOT NULL,
  "value"      text                     NOT NULL,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "settings_pkey" PRIMARY KEY (key)
);

ALTER TABLE "public"."settings"
  ENABLE ROW LEVEL SECURITY;

ALTER SEQUENCE "public"."hunt_communiques_id_seq" OWNED BY "public"."hunt_communiques"."id";

CREATE OR REPLACE FUNCTION public.change_sheets (
  p_channel_id uuid
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.get_channel_messages (
  p_channel_id uuid,
  p_limit      integer                  DEFAULT 50,
  p_before     timestamp with time zone DEFAULT NULL::timestamp WITH time zone
)
  RETURNS SETOF public.messages
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
begin
  insert into public.profiles (id, nickname)
  values (new.id, coalesce(new.raw_user_meta_data->>'nickname', 'User'));
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.handle_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

ALTER TABLE "public"."messages"
  ADD CONSTRAINT "messages_channel_id_fkey" FOREIGN KEY (channel_id) REFERENCES public.channels(id) ON DELETE CASCADE;

ALTER TABLE "public"."profiles"
  ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."channels"
  ADD CONSTRAINT "channels_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(id);

ALTER TABLE "public"."custom_emoji"
  ADD CONSTRAINT "custom_emoji_uploaded_by_fkey" FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id);

ALTER TABLE "public"."messages"
  ADD CONSTRAINT "messages_author_id_fkey" FOREIGN KEY (author_id) REFERENCES public.profiles(id);

ALTER TABLE "public"."reactions"
  ADD CONSTRAINT "reactions_message_id_fkey" FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE CASCADE;

ALTER TABLE "public"."reactions"
  ADD CONSTRAINT "reactions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id);

ALTER TABLE "public"."sessions"
  ADD CONSTRAINT "sessions_channel_id_fkey" FOREIGN KEY (channel_id) REFERENCES public.channels(id) ON DELETE CASCADE;

ALTER TABLE "public"."sessions"
  ADD CONSTRAINT "sessions_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(id);

ALTER TABLE "public"."messages"
  ADD CONSTRAINT "messages_session_id_fkey" FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;

CREATE INDEX hunt_communiques_channel_idx ON public.hunt_communiques USING btree (channel);

CREATE INDEX hunt_communiques_sender_idx ON public.hunt_communiques USING btree (sender);

CREATE INDEX hunt_communiques_timestamp_idx ON public.hunt_communiques USING btree ("timestamp" DESC);

CREATE INDEX idx_messages_channel_created ON public.messages USING btree (channel_id, created_at);

CREATE INDEX idx_messages_session_created ON public.messages USING btree (session_id, created_at);

CREATE INDEX idx_reactions_message ON public.reactions USING btree (message_id);

CREATE INDEX idx_sessions_channel_visible ON public.sessions USING btree (channel_id, visible);

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE POLICY "Authenticated users can create channels" ON "public"."channels"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update channels" ON "public"."channels"
  FOR UPDATE
  TO "authenticated"
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can view active channels" ON "public"."channels"
  FOR SELECT
  TO "authenticated"
  USING ((archived = false));

CREATE POLICY "Authenticated users can delete custom emoji" ON "public"."custom_emoji"
  FOR DELETE
  TO "authenticated"
  USING (true);

CREATE POLICY "Authenticated users can upload custom emoji" ON "public"."custom_emoji"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (true);

CREATE POLICY "Authenticated users can view custom emoji" ON "public"."custom_emoji"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "anon insert" ON "public"."hunt_communiques"
  FOR INSERT
  TO "anon"
  WITH CHECK (true);

CREATE POLICY "Authenticated users can send messages" ON "public"."messages"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((auth.uid() = author_id));

CREATE POLICY "Users can edit their own messages" ON "public"."messages"
  FOR UPDATE
  TO "authenticated"
  USING ((auth.uid() = author_id))
  WITH CHECK ((auth.uid() = author_id));

CREATE POLICY "Users can view messages from visible sessions" ON "public"."messages"
  FOR SELECT
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.sessions
  WHERE ((sessions.id = messages.session_id) AND (sessions.visible = true)))));

CREATE POLICY "read pins" ON "public"."pinned_messages"
  FOR SELECT
  TO PUBLIC
  USING (true);

CREATE POLICY "pin" ON "public"."pinned_messages"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((auth.uid() = pinned_by));

CREATE POLICY "unpin" ON "public"."pinned_messages"
  FOR DELETE
  TO PUBLIC
  USING ((auth.uid() IS NOT NULL));

CREATE POLICY "Authenticated users can view all profiles" ON "public"."profiles"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "Users can insert their own profile" ON "public"."profiles"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((auth.uid() = id));

CREATE POLICY "Users can update their own profile" ON "public"."profiles"
  FOR UPDATE
  TO "authenticated"
  USING ((auth.uid() = id))
  WITH CHECK ((auth.uid() = id));

CREATE POLICY "Authenticated users can add reactions" ON "public"."reactions"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Authenticated users can view reactions" ON "public"."reactions"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "Users can remove their own reactions" ON "public"."reactions"
  FOR DELETE
  TO "authenticated"
  USING ((auth.uid() = user_id));

CREATE POLICY "Authenticated users can create sessions" ON "public"."sessions"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update session visibility" ON "public"."sessions"
  FOR UPDATE
  TO "authenticated"
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can view visible sessions" ON "public"."sessions"
  FOR SELECT
  TO "authenticated"
  USING ((visible = true));

CREATE POLICY "Authenticated users can update settings" ON "public"."settings"
  FOR UPDATE
  TO "authenticated"
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can view settings" ON "public"."settings"
  FOR SELECT
  TO "authenticated"
  USING (true);

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."messages";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."pinned_messages";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."profiles";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."reactions";

GRANT EXECUTE ON FUNCTION "public"."change_sheets"(uuid) TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."change_sheets"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."change_sheets"(uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."change_sheets"(uuid) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."get_channel_messages"(uuid, integer, timestamp WITH time zone) TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."get_channel_messages"(uuid, integer, timestamp WITH time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_channel_messages"(uuid, integer, timestamp WITH time zone) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_channel_messages"(uuid, integer, timestamp WITH time zone) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."handle_new_user"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."handle_new_user"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."handle_new_user"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."handle_updated_at"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."handle_updated_at"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."handle_updated_at"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."handle_updated_at"() TO "service_role";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."hunt_communiques_id_seq" TO "anon", "authenticated";

REVOKE ALL ON SEQUENCE "public"."hunt_communiques_id_seq" FROM "postgres";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."hunt_communiques_id_seq" TO "postgres";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."hunt_communiques_id_seq" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."channels" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."channels" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."channels" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."channels" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."custom_emoji" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."custom_emoji" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."custom_emoji" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."custom_emoji" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."hunt_communiques" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."hunt_communiques" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."hunt_communiques" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."hunt_communiques" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."messages" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."messages" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."messages" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."messages" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."pinned_messages" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."pinned_messages" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."pinned_messages" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."pinned_messages" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."profiles" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."profiles" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."profiles" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."profiles" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."reactions" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."reactions" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."reactions" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."reactions" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."sessions" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."sessions" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."sessions" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."sessions" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."settings" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."settings" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."settings" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."settings" TO "service_role";

