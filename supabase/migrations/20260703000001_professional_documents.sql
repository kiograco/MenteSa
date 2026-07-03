-- Document upload for professional verification: a private Storage bucket plus a metadata
-- table so the admin panel can list/review documents without listing Storage objects directly.

insert into storage.buckets (id, name, public)
values ('professional-documents', 'professional-documents', false)
on conflict (id) do nothing;

-- Storage path convention: {professional_id}/{timestamp}-{filename}
create policy "professional_documents_storage_insert" on storage.objects for insert
  with check (
    bucket_id = 'professional-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "professional_documents_storage_select" on storage.objects for select
  using (
    bucket_id = 'professional-documents'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

create policy "professional_documents_storage_delete" on storage.objects for delete
  using (
    bucket_id = 'professional-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create table public.professional_documents (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professional_profiles (id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  created_at timestamptz not null default now()
);

alter table public.professional_documents enable row level security;

create policy "professional_documents_select" on public.professional_documents for select
  using (auth.uid() = professional_id or public.is_admin());

create policy "professional_documents_insert_own" on public.professional_documents for insert
  with check (auth.uid() = professional_id);

create policy "professional_documents_delete_own" on public.professional_documents for delete
  using (auth.uid() = professional_id);
