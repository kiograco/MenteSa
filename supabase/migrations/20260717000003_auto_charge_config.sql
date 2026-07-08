-- "Cobrança automática": lets a professional opt in to having a Pix charge generated automatically
-- N days before each scheduled session, instead of clicking "Cobrar via Pix" manually every time.
alter table public.professional_profiles
  add column auto_charge_enabled boolean not null default false,
  add column auto_charge_days_before int not null default 1;
