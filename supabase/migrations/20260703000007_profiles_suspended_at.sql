-- Lets the admin panel suspend an account (blocks login via auth.admin ban, tracked here so the
-- UI can show status without an extra auth.admin call per row).
alter table public.profiles add column suspended_at timestamptz;
