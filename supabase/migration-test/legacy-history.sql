-- Old-shape history for the migration test. Applied on the BASELINE schema only.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token) values
  ('00000000-0000-0000-0000-000000000000','a0000000-0000-4000-8000-000000000001','authenticated','authenticated',
   'legacy-a@test.local', extensions.crypt('password123', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}','{"nickname":"Legacy A"}', '2026-02-01','2026-02-01','','','','','','','',''),
  ('00000000-0000-0000-0000-000000000000','a0000000-0000-4000-8000-000000000002','authenticated','authenticated',
   'legacy-b@test.local', extensions.crypt('password123', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}','{"nickname":"Legacy B"}', '2026-02-01','2026-02-01','','','','','','','','');

insert into public.profiles (id, nickname, status, lock_pin) values
  ('a0000000-0000-4000-8000-000000000001','Legacy A','found_out','1234'),
  ('a0000000-0000-4000-8000-000000000002','Legacy B','online','987654')
on conflict (id) do update set nickname = excluded.nickname, status = excluded.status, lock_pin = excluded.lock_pin;

insert into public.channels (id, name, position, created_by, created_at) values
  ('c0000000-0000-4000-8000-000000000001','general',   0,'a0000000-0000-4000-8000-000000000001','2026-02-01'),
  ('c0000000-0000-4000-8000-000000000002','schist',    1,'a0000000-0000-4000-8000-000000000001','2026-02-02'),
  ('c0000000-0000-4000-8000-000000000003','adventures',2,'a0000000-0000-4000-8000-000000000002','2026-02-03'),
  ('c0000000-0000-4000-8000-000000000004','old-raids', 3,'a0000000-0000-4000-8000-000000000002','2026-02-04');

-- general: two dragged sessions + the current one; schist: one dragged + current; old-raids: current
insert into public.sessions (id, channel_id, visible, created_by, created_at) values
  ('50000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001',false,'a0000000-0000-4000-8000-000000000001','2026-02-10'),
  ('50000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000001',false,'a0000000-0000-4000-8000-000000000001','2026-05-10'),
  ('50000000-0000-4000-8000-000000000003','c0000000-0000-4000-8000-000000000001',true, 'a0000000-0000-4000-8000-000000000002','2026-09-10'),
  ('50000000-0000-4000-8000-000000000004','c0000000-0000-4000-8000-000000000002',false,'a0000000-0000-4000-8000-000000000001','2026-03-10'),
  ('50000000-0000-4000-8000-000000000005','c0000000-0000-4000-8000-000000000002',true, 'a0000000-0000-4000-8000-000000000001','2026-08-10'),
  ('50000000-0000-4000-8000-000000000006','c0000000-0000-4000-8000-000000000004',true, 'a0000000-0000-4000-8000-000000000002','2026-04-10');

insert into public.messages (id, channel_id, session_id, author_id, content, attachments, type, edited_at, deleted, created_at) values
  -- general / session 1 (hidden): 3 texts
  ('e0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','feb one','[]','text',null,false,'2026-02-11 10:00'),
  ('e0000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000002','feb two','[]','text',null,false,'2026-02-11 10:01'),
  ('e0000000-0000-4000-8000-000000000003','c0000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','feb three','[]','text',null,false,'2026-02-11 10:02'),
  -- general / session 2 (hidden): image + a deleted message with an attachment
  ('e0000000-0000-4000-8000-000000000004','c0000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000002',null,
   '[{"url":"https://cdn.example/m/cat.jpg","type":"image","filename":"cat.jpg","size":1000,"spoiler":false}]','text',null,false,'2026-05-11 09:00'),
  ('e0000000-0000-4000-8000-000000000005','c0000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000001','oops',
   '[{"url":"https://cdn.example/m/secret.png","type":"image","filename":"secret.png","size":10,"spoiler":false}]','text',null,true,'2026-05-11 09:01'),
  -- general / session 3 (visible): links, gif, video, two files, an edited message
  ('e0000000-0000-4000-8000-000000000006','c0000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000001','see https://example.com/a and https://Example.com/b.','[]','text',null,false,'2026-09-11 08:00'),
  ('e0000000-0000-4000-8000-000000000007','c0000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000002',null,
   '[{"url":"https://gifs.example/dance.gif","type":"gif","filename":"dance","size":0,"spoiler":false}]','gif',null,false,'2026-09-11 08:01'),
  ('e0000000-0000-4000-8000-000000000008','c0000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000001',null,
   '[{"url":"https://cdn.example/m/clip.mp4","type":"video","filename":"clip.mp4","size":50000,"spoiler":false}]','text',null,false,'2026-09-11 08:02'),
  ('e0000000-0000-4000-8000-000000000009','c0000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000002','raid plan',
   '[{"url":"https://cdn.example/m/raid.PMP","type":"file","filename":"raid.PMP","size":2048,"spoiler":false}]','text',null,false,'2026-09-11 08:03'),
  ('e0000000-0000-4000-8000-000000000010','c0000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000001',null,
   '[{"url":"https://cdn.example/m/notes.zip","type":"file","filename":"notes.zip","size":4096,"spoiler":false}]','text',null,false,'2026-09-11 08:04'),
  ('e0000000-0000-4000-8000-000000000011','c0000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000002','edited text','[]','text','2026-09-11 08:10',false,'2026-09-11 08:05'),
  -- schist / session 4 (hidden) and 5 (visible, link + image)
  ('e0000000-0000-4000-8000-000000000012','c0000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000004','a0000000-0000-4000-8000-000000000001','old schist','[]','text',null,false,'2026-03-11 12:00'),
  ('e0000000-0000-4000-8000-000000000013','c0000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000005','a0000000-0000-4000-8000-000000000002','look http://test.local/x',
   '[{"url":"https://cdn.example/m/rock.png","type":"image","filename":"rock.png","size":3000,"spoiler":true}]','text',null,false,'2026-08-11 12:00'),
  -- old-raids / session 6 (visible): 2 texts
  ('e0000000-0000-4000-8000-000000000014','c0000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000006','a0000000-0000-4000-8000-000000000002','raid one','[]','text',null,false,'2026-04-11 20:00'),
  ('e0000000-0000-4000-8000-000000000015','c0000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000006','a0000000-0000-4000-8000-000000000001','raid two','[]','text',null,false,'2026-04-11 20:01');

insert into public.pinned_messages (channel_id, message_id, pinned_by) values
  ('c0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000009','a0000000-0000-4000-8000-000000000001'),
  ('c0000000-0000-4000-8000-000000000002','e0000000-0000-4000-8000-000000000013','a0000000-0000-4000-8000-000000000002');

insert into public.reactions (message_id, user_id, emoji) values
  ('e0000000-0000-4000-8000-000000000006','a0000000-0000-4000-8000-000000000002','❤️'),
  ('e0000000-0000-4000-8000-000000000013','a0000000-0000-4000-8000-000000000001',':moogle:');
