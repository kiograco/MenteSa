-- Real e-signed informed consent (distinct from the general Terms of Use): typed name + a hash of
-- the exact document text shown + IP/user-agent captured server-side (only an Edge Function can
-- read the real client IP reliably — a client can't self-report it). No insert policy for
-- authenticated clients on purpose: the only writer is the sign-consent Edge Function, using the
-- service role, so the IP/user-agent columns can never be spoofed by the client. Immutable
-- (no update/delete) — a real signature record.
create table public.consent_signatures (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles (id) on delete cascade,
  professional_id uuid not null references public.professional_profiles (id) on delete cascade,
  document_version text not null,
  document_hash text not null,
  typed_name text not null,
  ip_address text,
  user_agent text,
  signed_at timestamptz not null default now()
);

alter table public.consent_signatures enable row level security;

create policy "consent_signatures_select_own" on public.consent_signatures for select
  using (auth.uid() = patient_id);

create policy "consent_signatures_select_professional" on public.consent_signatures for select
  using (auth.uid() = professional_id or public.is_admin());
