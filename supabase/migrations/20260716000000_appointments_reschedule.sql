-- "Reagendar" edits scheduled_at on the same appointment row (keeps notes/history attached)
-- instead of cancelling + creating a new one. previous_scheduled_at is just a trace of what the
-- time was right before the last reschedule — nothing in the app reads it for logic, it's for
-- audit/support purposes only (e.g. explaining a mismatch if a patient shows up at the old time).
alter table public.appointments
  add column previous_scheduled_at timestamptz;
