-- "Controle de Faltas": until now a patient who simply didn't show up was indistinguishable from a
-- properly cancelled appointment (see the gap this code documents in src/lib/metrics.ts) because
-- appointment_status only had scheduled/completed/cancelled. Adding a distinct enum value lets the
-- professional record a no-show explicitly from CalendarScreen.
-- Note: ALTER TYPE ... ADD VALUE only takes effect after this transaction commits, so it must not
-- be referenced by any other statement in this same migration file.
alter type public.appointment_status add value 'no_show';

-- Tracks whether the WhatsApp reminder job (send-appointment-reminder Edge Function, invoked by
-- pg_cron) has already messaged the patient about this appointment, so the periodic sweep never
-- double-sends.
alter table public.appointments
  add column whatsapp_reminder_sent_at timestamptz;
