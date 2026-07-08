-- Lightweight per-professional labels for organizing their own patient list (e.g. "Convênio X",
-- "Alta prioridade") — purely the professional's own metadata, not shared with the patient or
-- derived from any clinical data, so RLS is just "owns it" for every operation.
create table public.patient_tags (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.profiles (id) on delete cascade,
  patient_id uuid not null references public.profiles (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 40),
  color text not null default 'green',
  created_at timestamptz not null default now(),
  unique (professional_id, patient_id, label)
);

create index patient_tags_professional_idx on public.patient_tags (professional_id);

alter table public.patient_tags enable row level security;

create policy "patient_tags_all_own" on public.patient_tags for all
  using (auth.uid() = professional_id)
  with check (auth.uid() = professional_id);
