-- Professional logo, shown on the public profile and stamped on generated PDFs (recibo/
-- declarações/etc). Same public-bucket shape as avatars (20260703000008) — a logo is already
-- meant to be publicly visible, same exposure as the avatar photo.
alter table public.professional_profiles add column logo_url text;

insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do nothing;

create policy "logos_storage_select" on storage.objects for select
  using (bucket_id = 'logos');

create policy "logos_storage_insert" on storage.objects for insert
  with check (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "logos_storage_update" on storage.objects for update
  using (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "logos_storage_delete" on storage.objects for delete
  using (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
