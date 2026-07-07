-- Shared home for every PDF the app generates on a patient's behalf: payment receipts (recibo) and
-- the Biblioteca de Modelos outputs (declarações, relatórios, pareceres, laudos, encaminhamentos).
-- One bucket + one metadata table for all of them, differentiated by document_type, since they all
-- need the exact same dual patient/professional access shape as patient-documents
-- (20260707000001) — no reason to duplicate the bucket/policy boilerplate per document type.
insert into storage.buckets (id, name, public)
values ('generated-documents', 'generated-documents', false)
on conflict (id) do nothing;

-- Storage path convention: {patient_id}/{timestamp}-{filename}
create policy "generated_documents_storage_select" on storage.objects for select
  using (
    bucket_id = 'generated-documents'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.appointments a
        where a.patient_id::text = (storage.foldername(name))[1] and a.professional_id = auth.uid()
      )
      or public.is_admin()
    )
  );

create policy "generated_documents_storage_insert" on storage.objects for insert
  with check (
    bucket_id = 'generated-documents'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.appointments a
        where a.patient_id::text = (storage.foldername(name))[1] and a.professional_id = auth.uid()
      )
    )
  );

create table public.generated_documents (
  id uuid primary key default gen_random_uuid(),
  document_type text not null check (document_type in (
    'recibo', 'declaracao_comparecimento', 'declaracao_acompanhamento', 'relatorio', 'parecer', 'laudo', 'encaminhamento'
  )),
  patient_id uuid not null references public.profiles (id) on delete cascade,
  professional_id uuid not null references public.profiles (id) on delete cascade,
  appointment_id uuid references public.appointments (id) on delete set null,
  payment_id uuid references public.payments (id) on delete set null,
  storage_path text not null,
  file_name text not null,
  signed_at timestamptz,
  typed_name text,
  signature_hash text,
  created_at timestamptz not null default now()
);

alter table public.generated_documents enable row level security;

create policy "generated_documents_select" on public.generated_documents for select
  using (
    auth.uid() = patient_id
    or auth.uid() = professional_id
    or public.is_admin()
  );

create policy "generated_documents_insert_professional" on public.generated_documents for insert
  with check (auth.uid() = professional_id);
