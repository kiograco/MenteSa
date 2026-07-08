-- "Confirmação de presença": the patient clicks a link (sent via WhatsApp, no login) to confirm
-- they'll attend. confirmation_token is a separate, unguessable per-appointment secret — distinct
-- from account auth entirely, since confirming attendance shouldn't require signing in. Anyone with
-- the token can confirm (that's the point of a link sent to the patient's own WhatsApp), so this is
-- deliberately checked server-side by the confirm-attendance Edge Function (service role), not via
-- a client-facing RLS policy that would need to expose confirmed_at writes to anonymous callers.
alter table public.appointments
  add column confirmed_at timestamptz,
  add column confirmation_token uuid not null default gen_random_uuid();
