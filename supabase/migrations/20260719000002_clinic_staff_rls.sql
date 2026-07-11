-- Widens exactly the tables behind "Agenda" and "Pacientes" (staff's fixed permission set — never
-- Financeiro, never the clinical content of the Prontuário) so a clinic's staff member can act for
-- any professional in their clinic, via can_access_professional() (20260719000001). Every other
-- professional_id-scoped policy in the schema (session_notes, payments, expenses,
-- generated_documents, assessment_templates/responses, messages, patient_materials, etc.) is
-- deliberately left untouched — staff gets no access to any of those tables at all.

-- appointments (Agenda)
drop policy "appointments_select_participants" on public.appointments;
create policy "appointments_select_participants" on public.appointments for select
  using (auth.uid() = patient_id or public.can_access_professional(professional_id) or public.is_admin());

drop policy "appointments_update_participants" on public.appointments;
create policy "appointments_update_participants" on public.appointments for update
  using (auth.uid() = patient_id or public.can_access_professional(professional_id));

drop policy "appointments_insert_professional_existing_patient" on public.appointments;
create policy "appointments_insert_professional_existing_patient" on public.appointments for insert
  with check (
    public.can_access_professional(professional_id)
    and exists (
      select 1 from public.appointments existing
      where existing.patient_id = appointments.patient_id and existing.professional_id = appointments.professional_id
    )
  );

-- professional_availability (Agenda)
drop policy "availability_write_own" on public.professional_availability;
create policy "availability_write_own" on public.professional_availability for all
  using (public.can_access_professional(professional_id))
  with check (public.can_access_professional(professional_id));

-- professional_time_blocks (Agenda)
drop policy "time_blocks_write_own" on public.professional_time_blocks;
create policy "time_blocks_write_own" on public.professional_time_blocks for all
  using (public.can_access_professional(professional_id))
  with check (public.can_access_professional(professional_id));

-- profiles (Pacientes — reading a patient's name/avatar via the roster)
drop policy "profiles_select_own_patients" on public.profiles;
create policy "profiles_select_own_patients" on public.profiles for select
  using (
    exists (
      select 1 from public.appointments a
      where a.patient_id = profiles.id and public.can_access_professional(a.professional_id)
    )
  );

-- patient_tags (Pacientes — organização por tags)
drop policy "patient_tags_all_own" on public.patient_tags;
create policy "patient_tags_all_own" on public.patient_tags for all
  using (public.can_access_professional(professional_id))
  with check (public.can_access_professional(professional_id));

-- patient_profiles (Pacientes — ficha cadastral, leitura; cadastro em si continua só do próprio
-- paciente, sem policy de escrita pro profissional desde 20260714000000)
drop policy "patient_profiles_select_professional" on public.patient_profiles;
create policy "patient_profiles_select_professional" on public.patient_profiles for select
  using (
    exists (
      select 1 from public.appointments a
      where a.patient_id = patient_profiles.id and public.can_access_professional(a.professional_id)
    ) or public.is_admin()
  );
