-- Abstraction layer for nota fiscal issuance: no provider (eNotas/Focus NFe/etc.) is wired up yet,
-- so request-nota-fiscal always records an "unavailable" row today — this table exists so the UI
-- (status badge, message, retry) and RLS shape are already correct, and plugging in a real
-- provider later only changes the Edge Function, not the schema or the client.
create table public.nota_fiscal_requests (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments (id) on delete cascade,
  status text not null check (status in ('unavailable', 'pending', 'issued', 'failed')),
  provider text,
  pdf_url text,
  message text,
  requested_at timestamptz not null default now(),
  issued_at timestamptz
);

alter table public.nota_fiscal_requests enable row level security;

-- Same indirect relationship shape as profiles_select_own_patients (20260703000004): the owning
-- professional is only derivable via payments -> appointments, there's no direct FK for it.
create policy "nota_fiscal_requests_select_professional" on public.nota_fiscal_requests for select
  using (
    exists (
      select 1 from public.payments p
      join public.appointments a on a.id = p.appointment_id
      where p.id = nota_fiscal_requests.payment_id and a.professional_id = auth.uid()
    ) or public.is_admin()
  );

-- No client-facing insert/update policy on purpose: only the request-nota-fiscal Edge Function
-- (service role) writes here, same posture as consent_signatures/session_notes signature columns —
-- keeps the status/message trustworthy instead of something the client could fabricate.
