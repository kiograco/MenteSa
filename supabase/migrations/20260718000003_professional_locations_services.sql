-- "Cadastro de Locais e Serviços": lets a professional list the places they attend from and the
-- services they offer (each with its own duration/price), shown as read-only info on their public
-- profile and selectable in the Agenda's "Nova consulta" modal to pre-fill price/duration. Public
-- read, same convention as professional_availability/professional_time_blocks — the public profile
-- page needs to display these for any visitor.
create table public.professional_locations (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professional_profiles (id) on delete cascade,
  label text not null,
  address_street text,
  address_number text,
  address_complement text,
  address_neighborhood text,
  address_city text,
  address_state text,
  address_zip text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.professional_services (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professional_profiles (id) on delete cascade,
  name text not null,
  duration_minutes int not null default 50,
  price numeric(10, 2) not null,
  modality public.modality,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.professional_locations enable row level security;
alter table public.professional_services enable row level security;

create policy "professional_locations_select_all" on public.professional_locations for select
  using (true);

create policy "professional_locations_write_own" on public.professional_locations for all
  using (auth.uid() = professional_id)
  with check (auth.uid() = professional_id);

create policy "professional_services_select_all" on public.professional_services for select
  using (true);

create policy "professional_services_write_own" on public.professional_services for all
  using (auth.uid() = professional_id)
  with check (auth.uid() = professional_id);
