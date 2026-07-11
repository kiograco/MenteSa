-- "Multi-profissional por clínica + Acessos Administrativos": a clinic is deliberately a thin
-- grouping entity (id, name, owner) rather than a rewrite of professional_profiles itself — a
-- professional who never uses this feature has clinic_id null and nothing changes for them.
-- clinic_staff is the membership table: a staff login (profiles.role = 'staff') linked to exactly
-- one clinic, which transitively grants access to every professional_profiles row with that
-- clinic_id (not to other professionals directly — clinics don't let professionals see each
-- other's data, only staff acting on their behalf).
create table public.clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_professional_id uuid not null references public.professional_profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.professional_profiles add column clinic_id uuid references public.clinics (id);

create table public.clinic_staff (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (clinic_id, user_id)
);

alter table public.clinics enable row level security;
alter table public.clinic_staff enable row level security;

-- Only the owning professional manages the clinic row itself (name, who owns it).
create policy "clinics_select_own" on public.clinics for select
  using (auth.uid() = owner_professional_id or public.is_admin());

create policy "clinics_write_own" on public.clinics for all
  using (auth.uid() = owner_professional_id)
  with check (auth.uid() = owner_professional_id);

-- A staff member needs to see their own membership row (to know which clinic/professionals they
-- act for); the owning professional needs to see and manage who's on their staff.
create policy "clinic_staff_select" on public.clinic_staff for select
  using (
    auth.uid() = user_id
    or exists (select 1 from public.clinics c where c.id = clinic_staff.clinic_id and c.owner_professional_id = auth.uid())
    or public.is_admin()
  );

create policy "clinic_staff_write_owner" on public.clinic_staff for all
  using (exists (select 1 from public.clinics c where c.id = clinic_staff.clinic_id and c.owner_professional_id = auth.uid()))
  with check (exists (select 1 from public.clinics c where c.id = clinic_staff.clinic_id and c.owner_professional_id = auth.uid()));

-- Central check reused by every RLS policy scoped to staff's fixed permission set (Agenda +
-- Pacientes), same shape as is_admin() — one function to update instead of hunting down every
-- policy again if the access model ever changes. security definer so it can read clinic_staff/
-- professional_profiles regardless of the calling policy's own row visibility.
create function public.can_access_professional(target_professional_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select
    auth.uid() = target_professional_id
    or exists (
      select 1
      from public.professional_profiles pp
      join public.clinic_staff cs on cs.clinic_id = pp.clinic_id
      where pp.id = target_professional_id and cs.user_id = auth.uid()
    );
$$;
