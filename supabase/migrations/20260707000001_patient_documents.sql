-- Document attachments for the patient's ficha cadastral ("Anexos de documentos") — e.g. ID scans,
-- insurance card, referral letters. Same private-bucket-plus-metadata-table shape as
-- professional-documents (20260703000001), but either the patient or their treating professional
-- can upload/view, tracked via uploaded_by so the UI can show who attached what.
insert into storage.buckets (id, name, public)
values ('patient-documents', 'patient-documents', false)
on conflict (id) do nothing;

-- Storage path convention: {patient_id}/{timestamp}-{filename} — lets both the owning patient and
-- a professional with a shared appointment be checked without a join, mirroring the folder-segment
-- check already used by avatars/professional-documents.
create policy "patient_documents_storage_select" on storage.objects for select
  using (
    bucket_id = 'patient-documents'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.appointments a
        where a.patient_id::text = (storage.foldername(name))[1] and a.professional_id = auth.uid()
      )
      or public.is_admin()
    )
  );

create policy "patient_documents_storage_insert" on storage.objects for insert
  with check (
    bucket_id = 'patient-documents'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.appointments a
        where a.patient_id::text = (storage.foldername(name))[1] and a.professional_id = auth.uid()
      )
    )
  );

create policy "patient_documents_storage_delete" on storage.objects for delete
  using (
    bucket_id = 'patient-documents'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.appointments a
        where a.patient_id::text = (storage.foldername(name))[1] and a.professional_id = auth.uid()
      )
    )
  );

create table public.patient_documents (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles (id) on delete cascade,
  uploaded_by uuid not null references public.profiles (id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  created_at timestamptz not null default now()
);

alter table public.patient_documents enable row level security;

create policy "patient_documents_select" on public.patient_documents for select
  using (
    auth.uid() = patient_id
    or exists (
      select 1 from public.appointments a
      where a.patient_id = patient_documents.patient_id and a.professional_id = auth.uid()
    )
    or public.is_admin()
  );

create policy "patient_documents_insert" on public.patient_documents for insert
  with check (
    auth.uid() = uploaded_by
    and (
      auth.uid() = patient_id
      or exists (
        select 1 from public.appointments a
        where a.patient_id = patient_documents.patient_id and a.professional_id = auth.uid()
      )
    )
  );

create policy "patient_documents_delete_own" on public.patient_documents for delete
  using (auth.uid() = uploaded_by or public.is_admin());
