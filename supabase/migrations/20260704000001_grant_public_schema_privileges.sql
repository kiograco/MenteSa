-- A hosted Supabase project grants anon/authenticated broad table-level privileges on the public
-- schema automatically when the project is created — RLS (already defined by every migration
-- before this one) is the real security boundary on top of that, not these grants. A fresh
-- Postgres bootstrapped purely from this migration history (`supabase start`/`db reset` locally,
-- or any future CI/self-hosted setup) never gets that implicit platform step, so every query came
-- back "permission denied for table X" even though the RLS policies were otherwise correct —
-- caught by the E2E suite (e2e/booking.spec.ts, e2e/messaging.spec.ts) failing against a local
-- stack while the same queries worked fine against the already-provisioned production project.
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all routines in schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on routines to anon, authenticated, service_role;
