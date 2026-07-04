-- Patient asks to be notified if a specific (currently taken) slot with a professional frees up.
-- Deliberately simple lifecycle (no 'expired'/cron sweep): a cancellation notifies everyone
-- waiting for that exact slot at once; the appointments_professional_slot_active_key unique index
-- (20260703000011) guarantees only one of them can actually book it — first to complete checkout
-- wins, others just see the normal "already booked" error. The winner's own entry gets marked
-- 'claimed' by the booking flow; other patients' entries are simply left 'waiting' for a different
-- opening (no state machine needed for something this MVP doesn't require).
create table public.waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles (id) on delete cascade,
  professional_id uuid not null references public.professional_profiles (id) on delete cascade,
  desired_scheduled_at timestamptz not null,
  status text not null check (status in ('waiting', 'claimed')) default 'waiting',
  created_at timestamptz not null default now()
);

alter table public.waitlist_entries enable row level security;

create policy "waitlist_entries_select_own" on public.waitlist_entries for select
  using (auth.uid() = patient_id);

create policy "waitlist_entries_insert_own" on public.waitlist_entries for insert
  with check (auth.uid() = patient_id);

create policy "waitlist_entries_update_own" on public.waitlist_entries for update
  using (auth.uid() = patient_id);

create policy "waitlist_entries_delete_own" on public.waitlist_entries for delete
  using (auth.uid() = patient_id);

create policy "waitlist_entries_select_professional" on public.waitlist_entries for select
  using (auth.uid() = professional_id or public.is_admin());
