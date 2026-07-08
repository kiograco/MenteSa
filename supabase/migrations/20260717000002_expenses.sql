-- "Gestão de despesas": manual expense entries a professional logs (rent, supplies, subscriptions,
-- etc.) so FinancialDashboard can show net income after costs, not just after the platform
-- commission. Deliberately no fixed category enum — professionals' expense categories vary too much
-- to enumerate, so `category` is free text (mirrors how `professional_time_blocks.reason` is free text).
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professional_profiles (id) on delete cascade,
  category text not null,
  amount numeric(10, 2) not null,
  expense_date date not null,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.expenses enable row level security;

create policy "expenses_all_own" on public.expenses for all
  using (auth.uid() = professional_id)
  with check (auth.uid() = professional_id);
