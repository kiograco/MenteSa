-- "Sistema de Planos/Assinatura por profissional": a recurring subscription the PROFESSIONAL pays
-- the platform, independent of and on top of the existing 10% commission on each patient payment
-- (payments table, PLATFORM_FEE_RATE) — that table can't be reused here since payments.appointment_id
-- is a hard NOT NULL FK and a subscription charge has no appointment.
--
-- Deliberately just one plan for now, not a Basic/Pro tier split: nothing in the app is gated by
-- plan yet (see PLANO_IMPLEMENTACAO_FUNCIONALIDADES.md's own note that tiering is a pending
-- product decision), so inventing multiple tiers with no functional difference between them would
-- be dishonest UI. The schema supports more plans later without any migration needed.
--
-- IMPORTANT: `price` below is a placeholder (R$0) — update it via the Supabase dashboard/SQL editor
-- with the real monthly price before this goes live. Same posture already used for Receita Saúde/
-- Canva placeholders elsewhere in this app: ship the real mechanism, flag the one number that only
-- the business can decide.
create table public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price numeric(10, 2) not null,
  billing_interval text not null default 'monthly',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.professional_subscriptions (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professional_profiles (id) on delete cascade,
  plan_id uuid not null references public.subscription_plans (id),
  status text not null default 'pending' check (status in ('pending', 'active', 'cancelled', 'past_due')),
  mp_preapproval_id text,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.subscription_plans enable row level security;
alter table public.professional_subscriptions enable row level security;

-- Public read (the "Meu plano" upgrade screen needs to list plans before the professional has any
-- subscription row yet); no client write — plans are managed by the platform, not professionals.
create policy "subscription_plans_select_all" on public.subscription_plans for select
  using (true);

create policy "professional_subscriptions_select_own" on public.professional_subscriptions for select
  using (auth.uid() = professional_id or public.is_admin());

-- No insert/update policy: only create-mp-subscription (service role, after Mercado Pago confirms
-- the preapproval) and the webhook ever write these rows — same trust boundary as `payments`
-- (mercadopago-webhook is the sole source of truth for status, never the client).

insert into public.subscription_plans (name, price, billing_interval) values ('Assinatura MindCare', 0, 'monthly');
