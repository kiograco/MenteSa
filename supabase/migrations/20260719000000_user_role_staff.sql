-- New role for "Acessos Administrativos (Secretária)": a staff member isn't a professional
-- themselves (no professional_profiles row, no license), just a login linked to a clinic that can
-- act on behalf of the clinic's professionals within a fixed, limited scope (Agenda + Pacientes —
-- never Financeiro or the clinical content of the Prontuário). handle_new_user()
-- (20260703000003) already branches only on role = 'professional' for the professional_profiles
-- insert, so a 'staff' signup just gets a bare profiles row, no code change needed there.
-- ALTER TYPE ... ADD VALUE must be committed before the new value can be used anywhere (including
-- casts in other statements) — kept as its own migration so later migrations in this batch can
-- reference 'staff' safely.
alter type public.user_role add value 'staff';
