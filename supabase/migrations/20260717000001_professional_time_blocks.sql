-- "Bloqueio de horários": lets a professional mark a date/time range as unavailable (personal
-- commitment, vacation, etc.) so it stops showing up as bookable in the patient-facing profile
-- slot picker. Deliberately its own table rather than a professional_availability row, since
-- availability rows describe *recurring* weekly windows while a block is a one-off range that can
-- span multiple days and needs a free-text reason.
create table public.professional_time_blocks (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professional_profiles (id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  reason text,
  created_at timestamptz not null default now(),
  constraint time_block_range_valid check (end_at > start_at)
);

alter table public.professional_time_blocks enable row level security;

-- Public read, same convention as professional_availability: the patient-facing slot picker
-- (ProfilePage) needs to filter out blocked times for any visitor, not just the owner.
create policy "time_blocks_select_all" on public.professional_time_blocks for select
  using (true);

create policy "time_blocks_write_own" on public.professional_time_blocks for all
  using (auth.uid() = professional_id)
  with check (auth.uid() = professional_id);
