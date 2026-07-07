-- The ficha cadastral (patient_profiles) is now filled in only by the patient themselves
-- (Configurações → Meus dados), not by the treating professional — having both sides able to write
-- the same row made it ambiguous who the source of truth was. The professional keeps read-only
-- access via patient_profiles_select_professional (unchanged); only the write policies for the
-- professional are removed here. The patient's own select/insert/update policies are untouched.
drop policy "patient_profiles_insert_professional" on public.patient_profiles;
drop policy "patient_profiles_update_professional" on public.patient_profiles;
