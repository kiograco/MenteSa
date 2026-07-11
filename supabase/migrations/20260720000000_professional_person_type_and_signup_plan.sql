-- Two additions to professional signup:
-- 1. "Pessoa Física vs Pessoa Jurídica": every professional registration (not just clinics)
--    declares which kind of registration it is — Física keeps using the existing `cpf` field,
--    Jurídica additionally needs a CNPJ and razão social.
-- 2. Choosing a subscription plan becomes mandatory at signup (LoginPage's registration form).
--    The chosen plan can't be turned into a real Mercado Pago subscription yet at this exact
--    moment — signUp() returns no session until the e-mail is confirmed, so there's no
--    authenticated caller to invoke create-mp-subscription with — so instead handle_new_user()
--    (same security-definer trigger that already creates professional_profiles) records the
--    choice as a 'pending' professional_subscriptions row immediately. Once the professional first
--    logs in, "Meu plano" (ProfessionalSettingsScreen) sees that pending row and offers "Pagar
--    agora", which reuses it (see create-mp-subscription's updated reuse-existing-pending logic)
--    instead of creating a second row for the same plan.
alter table public.professional_profiles
  add column person_type text not null default 'fisica' check (person_type in ('fisica', 'juridica')),
  add column cnpj text,
  add column razao_social text;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  new_role public.user_role;
  chosen_plan_id uuid;
begin
  new_role := coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'patient');

  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', 'Novo usuário'),
    new_role
  );

  if new_role = 'professional' then
    insert into public.professional_profiles (id, license_type, license_number, person_type, cnpj, razao_social)
    values (
      new.id,
      coalesce(new.raw_user_meta_data ->> 'license_type', 'CRP'),
      coalesce(new.raw_user_meta_data ->> 'license_number', ''),
      coalesce(new.raw_user_meta_data ->> 'person_type', 'fisica'),
      new.raw_user_meta_data ->> 'cnpj',
      new.raw_user_meta_data ->> 'razao_social'
    )
    on conflict (id) do nothing;

    chosen_plan_id := (new.raw_user_meta_data ->> 'plan_id')::uuid;
    if chosen_plan_id is not null then
      insert into public.professional_subscriptions (professional_id, plan_id, status)
      values (new.id, chosen_plan_id, 'pending');
    end if;
  end if;

  return new;
end;
$$;
