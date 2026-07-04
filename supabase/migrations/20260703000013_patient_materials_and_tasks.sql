-- "Portal do paciente (documentos)" and "Biblioteca de materiais" are the same feature seen from
-- two sides: the professional shares files (broadcast to all patients, or targeted at one), the
-- patient sees what's shared with them. Same bucket+metadata-table shape as
-- professional-documents (20260703000001), but the recipient can be "all my patients" (patient_id
-- null) or a specific one.
insert into storage.buckets (id, name, public)
values ('shared-materials', 'shared-materials', false)
on conflict (id) do nothing;

-- Storage path convention: {professional_id}/{timestamp}-{filename}
create policy "shared_materials_storage_insert" on storage.objects for insert
  with check (
    bucket_id = 'shared-materials'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "shared_materials_storage_professional_select" on storage.objects for select
  using (
    bucket_id = 'shared-materials'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "shared_materials_storage_professional_delete" on storage.objects for delete
  using (
    bucket_id = 'shared-materials'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create table public.patient_materials (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professional_profiles (id) on delete cascade,
  patient_id uuid references public.profiles (id) on delete cascade, -- null = shared with all of this professional's patients
  storage_path text not null,
  file_name text not null,
  created_at timestamptz not null default now()
);

alter table public.patient_materials enable row level security;

create policy "patient_materials_select_professional" on public.patient_materials for select
  using (auth.uid() = professional_id or public.is_admin());

create policy "patient_materials_insert_professional" on public.patient_materials for insert
  with check (auth.uid() = professional_id);

create policy "patient_materials_delete_professional" on public.patient_materials for delete
  using (auth.uid() = professional_id);

create policy "patient_materials_select_patient" on public.patient_materials for select
  using (
    patient_id = auth.uid()
    or (
      patient_id is null
      and exists (
        select 1 from public.appointments a
        where a.patient_id = auth.uid() and a.professional_id = patient_materials.professional_id
      )
    )
  );

-- Patients read the file itself (not just the metadata row) through this same relationship —
-- joins on the metadata table instead of parsing the storage path, since a broadcast material's
-- folder segment is the professional's id, not the patient's.
create policy "shared_materials_storage_patient_select" on storage.objects for select
  using (
    bucket_id = 'shared-materials'
    and exists (
      select 1 from public.patient_materials pm
      where pm.storage_path = storage.objects.name
        and (
          pm.patient_id = auth.uid()
          or (
            pm.patient_id is null
            and exists (
              select 1 from public.appointments a
              where a.patient_id = auth.uid() and a.professional_id = pm.professional_id
            )
          )
        )
    )
  );

-- Tasks/exercises the professional assigns to a specific patient; the patient marks them done.
create table public.patient_tasks (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professional_profiles (id) on delete cascade,
  patient_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  description text,
  due_date date,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.patient_tasks enable row level security;

create policy "patient_tasks_professional_all" on public.patient_tasks for all
  using (auth.uid() = professional_id or public.is_admin())
  with check (auth.uid() = professional_id);

create policy "patient_tasks_select_patient" on public.patient_tasks for select
  using (auth.uid() = patient_id);

create policy "patient_tasks_update_patient" on public.patient_tasks for update
  using (auth.uid() = patient_id);
