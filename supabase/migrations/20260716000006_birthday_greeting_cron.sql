-- Daily sweep that calls send-birthday-greeting. Same pg_cron/pg_net/Vault pattern as
-- 20260707000005 (appointment reminders), just once a day instead of every 15 min, and with its
-- own pair of Vault secrets so it doesn't collide with the reminder job's.
--
-- MANUAL STEP REQUIRED AFTER DEPLOY (same reason as the reminder job — these values don't exist at
-- migration-authoring time): once `supabase functions deploy send-birthday-greeting` has run and
-- its CRON_SECRET is set via `supabase secrets set CRON_SECRET=...` (reuses the same CRON_SECRET as
-- send-appointment-reminder if you like, or a separate one), run once in the SQL editor:
--   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/send-birthday-greeting', 'birthday_function_url');
--   select vault.create_secret('<same value as the CRON_SECRET secret>', 'birthday_cron_secret');
-- Until those two secrets exist, the job below runs daily but no-ops.
select
  cron.schedule(
    'send-birthday-greetings',
    '0 9 * * *',
    $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'birthday_function_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'birthday_cron_secret')
      ),
      body := '{}'::jsonb
    )
    where exists (select 1 from vault.decrypted_secrets where name = 'birthday_function_url')
      and exists (select 1 from vault.decrypted_secrets where name = 'birthday_cron_secret');
    $$
  );
