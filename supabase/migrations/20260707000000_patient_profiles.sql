-- Patient intake record ("Cadastro de Paciente"): personal/contact data, legal guardian (for
-- minors), insurance, emergency contacts and clinical history. Mirrors the professional_profiles
-- shape (a 1:1 satellite table keyed on profiles.id) rather than bloating profiles itself, since
-- these fields are patient-specific, mostly optional, and editable by both the patient and the
-- treating professional.
create table public.patient_profiles (
  id uuid primary key references public.profiles (id) on delete cascade,
  birth_date date,
  cpf text,
  address_street text,
  address_number text,
  address_complement text,
  address_neighborhood text,
  address_city text,
  address_state text,
  address_zip text,
  emergency_contact_name text,
  emergency_contact_phone text,
  emergency_contact_relationship text,
  legal_guardian_name text,
  legal_guardian_cpf text,
  legal_guardian_phone text,
  legal_guardian_relationship text,
  insurance_provider text,
  insurance_plan text,
  insurance_card_number text,
  clinical_history text,
  whatsapp_reminders_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.patient_profiles enable row level security;

-- Patient manages their own record.
create policy "patient_profiles_select_own" on public.patient_profiles for select
  using (auth.uid() = id);

create policy "patient_profiles_insert_own" on public.patient_profiles for insert
  with check (auth.uid() = id);

create policy "patient_profiles_update_own" on public.patient_profiles for update
  using (auth.uid() = id);

-- Treating professional reads/fills the ficha cadastral shown in the EHR "Cadastro" tab — same
-- indirect "has an appointment together" relationship already established by
-- profiles_select_own_patients (20260703000004) and assessment_responses_select_professional
-- (20260703000012); there's no direct FK from patient_profiles to a professional.
create policy "patient_profiles_select_professional" on public.patient_profiles for select
  using (
    exists (
      select 1 from public.appointments a
      where a.patient_id = patient_profiles.id and a.professional_id = auth.uid()
    ) or public.is_admin()
  );

create policy "patient_profiles_insert_professional" on public.patient_profiles for insert
  with check (
    exists (
      select 1 from public.appointments a
      where a.patient_id = patient_profiles.id and a.professional_id = auth.uid()
    )
  );

create policy "patient_profiles_update_professional" on public.patient_profiles for update
  using (
    exists (
      select 1 from public.appointments a
      where a.patient_id = patient_profiles.id and a.professional_id = auth.uid()
    )
  );
