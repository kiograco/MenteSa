-- Structured public-facing tag for who the professional treats (Crianças/Adolescentes/Adultos/
-- Idosos), distinct from the free-text specialties/approaches arrays — this one drives a fixed
-- checkbox group in ProfessionalSettingsScreen and a directory filter, so it needs a known,
-- constrained vocabulary rather than free text.
alter table public.professional_profiles
  add column target_audience text[] not null default '{}';
