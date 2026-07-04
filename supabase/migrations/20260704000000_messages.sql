-- Direct messaging between a patient and a professional they have an appointment history with.
-- Mirrors the professional_id/patient_id shape already used by patient_materials/patient_tasks,
-- and reuses the same "relationship must exist via appointments" check already established by
-- profiles_select_own_patients (20260703000004) and assessment_responses_select_professional
-- (20260703000012), so a message can't be sent to someone who was never actually a patient/professional.
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.profiles(id) on delete cascade,
  patient_id uuid not null references public.profiles(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 4000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index messages_thread_idx on public.messages (professional_id, patient_id, created_at);

alter table public.messages enable row level security;

create policy "messages_select_participants" on public.messages for select
  using (auth.uid() = professional_id or auth.uid() = patient_id);

create policy "messages_insert_participants" on public.messages for insert
  with check (
    auth.uid() = sender_id
    and (auth.uid() = professional_id or auth.uid() = patient_id)
    and exists (
      select 1 from public.appointments a
      where a.professional_id = messages.professional_id and a.patient_id = messages.patient_id
    )
  );

-- Only used to flip read_at when the recipient opens a thread — no delete policy, messages are
-- an immutable record of what was actually said (same posture as reviews/consent_signatures).
create policy "messages_update_read_receipt" on public.messages for update
  using (auth.uid() = professional_id or auth.uid() = patient_id)
  with check (auth.uid() = professional_id or auth.uid() = patient_id);

-- Enables live delivery via supabase.channel(...).on("postgres_changes", ...) instead of polling.
alter publication supabase_realtime add table public.messages;
