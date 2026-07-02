-- MindCare MVP schema: profiles, professional data, scheduling, payments, EHR, video, reviews
-- Run with `supabase db push` (or paste into the Supabase SQL editor) after connecting a project.

create extension if not exists "pgcrypto";

-- ─── Enums ──────────────────────────────────────────────────────────────────
create type public.user_role as enum ('patient', 'professional', 'admin');
create type public.verification_status as enum ('pending', 'verified', 'rejected');
create type public.modality as enum ('online', 'presencial');
create type public.appointment_status as enum ('scheduled', 'completed', 'cancelled');
create type public.payment_status as enum ('pending', 'paid', 'refunded');

-- ─── profiles (1:1 with auth.users) ────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  role public.user_role not null default 'patient',
  phone text,
  avatar_url text,
  created_at timestamptz not null default now()
);

-- Auto-create a profile row whenever a new auth user signs up.
-- Expects role/full_name passed via supabase.auth.signUp({ options: { data: { full_name, role } } }).
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', 'Novo usuário'),
    coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'patient')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create function public.is_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- ─── professional_profiles ─────────────────────────────────────────────────
create table public.professional_profiles (
  id uuid primary key references public.profiles (id) on delete cascade,
  bio text,
  specialties text[] not null default '{}',
  approaches text[] not null default '{}',
  license_type text not null default 'CRP', -- CRP or CRM
  license_number text not null,
  verification_status public.verification_status not null default 'pending',
  session_price numeric(10, 2) not null default 0,
  modalities public.modality[] not null default '{}',
  city text,
  state text,
  insurances text[] not null default '{}',
  years_experience int not null default 0,
  created_at timestamptz not null default now()
);

-- ─── professional_availability ─────────────────────────────────────────────
create table public.professional_availability (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professional_profiles (id) on delete cascade,
  weekday int check (weekday between 0 and 6), -- recurring weekly slot (0=Sunday)
  specific_date date,                          -- or a one-off date override
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  constraint one_of_weekday_or_date check (
    (weekday is not null and specific_date is null) or
    (weekday is null and specific_date is not null)
  )
);

-- ─── appointments ───────────────────────────────────────────────────────────
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles (id) on delete cascade,
  professional_id uuid not null references public.professional_profiles (id) on delete cascade,
  scheduled_at timestamptz not null,
  duration_minutes int not null default 50,
  modality public.modality not null default 'online',
  status public.appointment_status not null default 'scheduled',
  price numeric(10, 2) not null,
  created_at timestamptz not null default now()
);

-- ─── payments (MVP: mock provider, real integration deferred) ─────────────
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  status public.payment_status not null default 'pending',
  method text not null default 'mock',
  amount numeric(10, 2) not null,
  platform_fee numeric(10, 2) not null default 0,
  provider text not null default 'mock',
  created_at timestamptz not null default now()
);

-- ─── session_notes (EHR) + AI summary ──────────────────────────────────────
create table public.session_notes (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  professional_id uuid not null references public.professional_profiles (id) on delete cascade,
  notes text not null default '',
  ai_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── video_rooms ────────────────────────────────────────────────────────────
create table public.video_rooms (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null unique references public.appointments (id) on delete cascade,
  room_url text not null,
  provider_room_id text not null,
  created_at timestamptz not null default now()
);

-- ─── reviews ─────────────────────────────────────────────────────────────────
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null unique references public.appointments (id) on delete cascade,
  patient_id uuid not null references public.profiles (id) on delete cascade,
  professional_id uuid not null references public.professional_profiles (id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

-- ─── Row Level Security ─────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.professional_profiles enable row level security;
alter table public.professional_availability enable row level security;
alter table public.appointments enable row level security;
alter table public.payments enable row level security;
alter table public.session_notes enable row level security;
alter table public.video_rooms enable row level security;
alter table public.reviews enable row level security;

-- profiles: own row, or the profile of a verified professional (public directory needs name/avatar)
create policy "profiles_select" on public.profiles for select
  using (
    auth.uid() = id
    or public.is_admin()
    or exists (
      select 1 from public.professional_profiles pp
      where pp.id = profiles.id and pp.verification_status = 'verified'
    )
  );

create policy "profiles_update_own" on public.profiles for update
  using (auth.uid() = id);

-- professional_profiles: public if verified, owner can always see/manage their own (incl. pending)
create policy "professional_profiles_select" on public.professional_profiles for select
  using (verification_status = 'verified' or auth.uid() = id or public.is_admin());

create policy "professional_profiles_insert_own" on public.professional_profiles for insert
  with check (auth.uid() = id);

create policy "professional_profiles_update_own" on public.professional_profiles for update
  using (auth.uid() = id or public.is_admin());

-- availability: public read (needed to render open slots in the directory/profile), owner writes
create policy "availability_select_all" on public.professional_availability for select
  using (true);

create policy "availability_write_own" on public.professional_availability for all
  using (auth.uid() = professional_id)
  with check (auth.uid() = professional_id);

-- appointments: visible/editable only to the two participants
create policy "appointments_select_participants" on public.appointments for select
  using (auth.uid() = patient_id or auth.uid() = professional_id or public.is_admin());

create policy "appointments_insert_patient" on public.appointments for insert
  with check (auth.uid() = patient_id);

create policy "appointments_update_participants" on public.appointments for update
  using (auth.uid() = patient_id or auth.uid() = professional_id);

-- payments: visible to the appointment's participants; patient can create their own pending/paid record (MVP mock flow)
create policy "payments_select_participants" on public.payments for select
  using (
    exists (
      select 1 from public.appointments a
      where a.id = payments.appointment_id
        and (a.patient_id = auth.uid() or a.professional_id = auth.uid())
    ) or public.is_admin()
  );

create policy "payments_insert_patient" on public.payments for insert
  with check (
    exists (
      select 1 from public.appointments a
      where a.id = payments.appointment_id and a.patient_id = auth.uid()
    )
  );

-- session_notes: only the treating professional (and admin) — patients do not read raw clinical notes in the MVP
create policy "session_notes_professional_only" on public.session_notes for all
  using (auth.uid() = professional_id or public.is_admin())
  with check (auth.uid() = professional_id);

-- video_rooms: visible to the appointment's participants; written only by the service role (Edge Function)
create policy "video_rooms_select_participants" on public.video_rooms for select
  using (
    exists (
      select 1 from public.appointments a
      where a.id = video_rooms.appointment_id
        and (a.patient_id = auth.uid() or a.professional_id = auth.uid())
    )
  );

-- reviews: public read, patient writes their own after a completed appointment
create policy "reviews_select_all" on public.reviews for select
  using (true);

create policy "reviews_insert_patient" on public.reviews for insert
  with check (
    auth.uid() = patient_id
    and exists (
      select 1 from public.appointments a
      where a.id = reviews.appointment_id and a.patient_id = auth.uid() and a.status = 'completed'
    )
  );

create policy "reviews_update_own" on public.reviews for update
  using (auth.uid() = patient_id);
