-- Resolução CFP nº 11/2018 requires psychologists to register their remote/tech-mediated service
-- modality with CFP's e-Psi system before offering it — a personal regulatory obligation the
-- platform can't verify directly (there's no public e-Psi lookup API, same situation as CRP/CRM
-- verification), but it can at least require an explicit declaration at signup, the same way
-- terms_accepted_at captures real consent instead of assuming it.
alter table public.professional_profiles add column epsi_declared_at timestamptz;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  new_role public.user_role;
begin
  new_role := coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'patient');

  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', 'Novo usuário'),
    new_role
  );

  if new_role = 'professional' then
    insert into public.professional_profiles (id, license_type, license_number, epsi_declared_at)
    values (
      new.id,
      coalesce(new.raw_user_meta_data ->> 'license_type', 'CRP'),
      coalesce(new.raw_user_meta_data ->> 'license_number', ''),
      (new.raw_user_meta_data ->> 'epsi_declared_at')::timestamptz
    )
    on conflict (id) do nothing;
  end if;

  return new;
end;
$$;
