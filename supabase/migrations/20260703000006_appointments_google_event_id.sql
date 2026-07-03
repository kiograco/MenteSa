-- Tracks the Google Calendar event created for an appointment, so re-syncing updates the existing
-- event instead of creating a duplicate every time "Sincronizar agora" is clicked.
alter table public.appointments
  add column google_event_id text;
