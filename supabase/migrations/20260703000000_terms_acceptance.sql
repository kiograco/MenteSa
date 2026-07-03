-- Audit trail for ToS/Privacy Policy consent, required by the signup UI going forward.
-- Existing rows default to now() at migration time (harmless for the fake demo seed users).
alter table public.profiles
  add column terms_accepted_at timestamptz not null default now();
