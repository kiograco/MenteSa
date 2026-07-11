-- "Site de Agendamentos com branding completo": a friendly, unique URL slug (kept alongside the
-- UUID, not replacing it — old /perfil/{uuid} links keep working) plus a simple accent color and
-- cover image for the public profile page.
alter table public.professional_profiles
  add column slug text unique,
  add column accent_color text,
  add column cover_url text;
