-- Validated screening questionnaires (PHQ-9, GAD-7 — both public domain, free to use; BDI is
-- deliberately excluded, it's commercially licensed by Pearson). Answers are an immutable record
-- of what the patient reported at that point in time — no update/delete policy, same spirit as
-- `reviews`.
create table public.assessment_responses (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles (id) on delete cascade,
  instrument text not null check (instrument in ('phq9', 'gad7')),
  answers int[] not null,
  total_score int not null,
  severity text not null,
  created_at timestamptz not null default now()
);

alter table public.assessment_responses enable row level security;

create policy "assessment_responses_select_own" on public.assessment_responses for select
  using (auth.uid() = patient_id);

create policy "assessment_responses_insert_own" on public.assessment_responses for insert
  with check (auth.uid() = patient_id);

-- Same indirect-relationship shape as profiles_select_own_patients (20260703000004): the treating
-- professional is only derivable via a shared appointment, there's no direct FK for it.
create policy "assessment_responses_select_professional" on public.assessment_responses for select
  using (
    exists (
      select 1 from public.appointments a
      where a.patient_id = assessment_responses.patient_id and a.professional_id = auth.uid()
    ) or public.is_admin()
  );
