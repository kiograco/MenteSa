-- Lets a professional create a follow-up appointment for a patient they already have a
-- relationship with (used by CalendarScreen's "Nova consulta"). Scoped to existing patients only
-- — a professional cannot fabricate an appointment for an arbitrary patient_id they've never
-- actually served, since there is no legitimate way to look up a stranger's user id from the UI
-- either (profiles RLS doesn't allow searching all patients).
create policy "appointments_insert_professional_existing_patient" on public.appointments for insert
  with check (
    auth.uid() = professional_id
    and exists (
      select 1 from public.appointments existing
      where existing.patient_id = appointments.patient_id and existing.professional_id = auth.uid()
    )
  );
