-- Expand the status column to support alert/safety statuses
alter table public.profiles drop constraint if exists profiles_status_check;

alter table public.profiles add constraint profiles_status_check
  check (status in (
    'online',
    'away',
    'offline',
    'under_close_watch',
    'found_out',
    'you_can_call',
    'potential_eep'
  ));
