-- Pre-existing gap: profiles_select (init migration) never let a professional see their own
-- patients' name/avatar — only "see your own row", "admin", or "see a verified professional's
-- public row". Every join from appointments -> profiles(full_name) on the professional's side
-- (ProfessionalDashboard, EHR, and the new CalendarScreen) has been silently returning null for
-- the patient's name because of this, falling back to the generic "Paciente" placeholder text.
create policy "profiles_select_own_patients" on public.profiles for select
  using (
    exists (
      select 1 from public.appointments a
      where a.patient_id = profiles.id and a.professional_id = auth.uid()
    )
  );
