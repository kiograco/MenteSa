-- Periodic sweep that calls the send-appointment-reminder Edge Function (WhatsApp reminders via
-- the Meta Cloud API) so patients get messaged ~24h before their appointment without a human
-- triggering it. Supabase has no built-in scheduler, so this uses the two Postgres extensions
-- Supabase does support for this: pg_cron (runs the schedule) and pg_net (makes the HTTP call from
-- inside Postgres).
--
-- MANUAL STEP REQUIRED AFTER DEPLOY (can't be done from a migration file, since the values don't
-- exist yet at migration-authoring time): once `supabase functions deploy send-appointment-reminder`
-- has run and its CRON_SECRET is set via `supabase secrets set CRON_SECRET=...`, store the same two
-- values in Vault so this job can use them, by running once in the SQL editor:
--   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/send-appointment-reminder', 'reminder_function_url');
--   select vault.create_secret('<same value as the CRON_SECRET secret>', 'reminder_cron_secret');
-- Until those two secrets exist, the job below runs every 15 minutes but no-ops (net.http_post is
-- skipped whenever the config is missing).
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select
  cron.schedule(
    'send-appointment-reminders',
    '*/15 * * * *',
    $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'reminder_function_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'reminder_cron_secret')
      ),
      body := '{}'::jsonb
    )
    where exists (select 1 from vault.decrypted_secrets where name = 'reminder_function_url')
      and exists (select 1 from vault.decrypted_secrets where name = 'reminder_cron_secret');
    $$
  );
