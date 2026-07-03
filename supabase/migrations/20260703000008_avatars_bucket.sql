-- Public Storage bucket for profile photos. Public (unlike professional-documents, which is
-- private) because avatars are already shown in the public directory/profile pages — same
-- exposure as profiles.full_name. Path convention: {user_id}/{timestamp}-{filename}, so RLS can
-- check the first path segment against auth.uid() without a lookup table.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "avatars_storage_select" on storage.objects for select
  using (bucket_id = 'avatars');

create policy "avatars_storage_insert" on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_storage_update" on storage.objects for update
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_storage_delete" on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
