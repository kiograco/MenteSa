-- Lets a clinic member (any professional_profiles row sharing a clinic_id, or staff via
-- clinic_staff) read the CLINIC OWNER's subscription row — one subscription per clinic covers
-- every professional registered under it (decision confirmed with the user), so the payment-gate
-- check (src/lib/subscriptions.ts#getSubscriptionAccess) needs to resolve "is my clinic's owner
-- paid" for members who aren't the owner themselves. Existing policy
-- (professional_subscriptions_select_own) already covers the owner reading their own row; this
-- adds the one additional case without loosening access to anyone else's subscription data.
create policy "professional_subscriptions_select_clinic_member" on public.professional_subscriptions for select
  using (
    exists (
      select 1 from public.clinics c
      join public.professional_profiles pp on pp.clinic_id = c.id
      where c.owner_professional_id = professional_subscriptions.professional_id
        and pp.id = auth.uid()
    )
  );

-- A newly-invited clinic professional starts out verification_status = 'pending' (same as any
-- self-signed-up professional awaiting review), so the existing "verified OR self" policies on
-- professional_profiles/profiles wouldn't let the clinic OWNER see them yet — needed for the
-- "Psicólogos da clínica" list in Configurações to actually show who's been invited.
create policy "professional_profiles_select_clinic_owner" on public.professional_profiles for select
  using (
    exists (
      select 1 from public.clinics c
      where c.id = professional_profiles.clinic_id and c.owner_professional_id = auth.uid()
    )
  );

create policy "profiles_select_clinic_owner" on public.profiles for select
  using (
    exists (
      select 1 from public.professional_profiles pp
      join public.clinics c on c.id = pp.clinic_id
      where pp.id = profiles.id and c.owner_professional_id = auth.uid()
    )
  );
