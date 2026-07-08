-- Daily sweep that calls auto-charge-sessions. Same pg_cron/pg_net/Vault pattern as
-- 20260707000005 (appointment reminders) and 20260716000006 (birthday greetings), with its own
-- pair of Vault secrets so it doesn't collide with those jobs'.
--
-- MANUAL STEP REQUIRED AFTER DEPLOY (these values don't exist at migration-authoring time): once
-- `supabase functions deploy auto-charge-sessions --no-verify-jwt` has run and its CRON_SECRET is
-- set via `supabase secrets set CRON_SECRET=...` (reuses the same CRON_SECRET as the other cron
-- jobs if you like, or a separate one), run once in the SQL editor:
--   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/auto-charge-sessions', 'auto_charge_function_url');
--   select vault.create_secret('<same value as the CRON_SECRET secret>', 'auto_charge_cron_secret');
-- Until those two secrets exist, the job below runs daily but no-ops.
select
  cron.schedule(
    'auto-charge-sessions',
    '0 8 * * *',
    $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'auto_charge_function_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'auto_charge_cron_secret')
      ),
      body := '{}'::jsonb
    )
    where exists (select 1 from vault.decrypted_secrets where name = 'auto_charge_function_url')
      and exists (select 1 from vault.decrypted_secrets where name = 'auto_charge_cron_secret');
    $$
  );
