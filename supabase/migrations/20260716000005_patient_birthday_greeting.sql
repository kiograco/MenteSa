-- Tracks the last year a patient was sent a birthday greeting, so the daily cron
-- (send-birthday-greeting) doesn't message them twice in the same year if it runs more than once
-- on the day (or the day repeats across a run boundary). A year number is enough — birthdays only
-- happen once a year, unlike appointment reminders which need a precise timestamp.
alter table public.patient_profiles add column last_birthday_greeted_year int;
