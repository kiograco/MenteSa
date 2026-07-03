-- Fixes broken professional signup when e-mail confirmation is enabled: signUp() returns no
-- session until the user confirms their e-mail, so the client-side insert into
-- professional_profiles (running as the anon/unauthenticated client) was rejected by RLS
-- ("new row violates row-level security policy"). Moving the insert into this trigger avoids
-- the problem entirely — it runs security definer, at account-creation time, regardless of
-- confirmation status. Expects license_type/license_number passed the same way full_name/role
-- already are: supabase.auth.signUp({ options: { data: { full_name, role, license_type, license_number } } }).
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
    insert into public.professional_profiles (id, license_type, license_number)
    values (
      new.id,
      coalesce(new.raw_user_meta_data ->> 'license_type', 'CRP'),
      coalesce(new.raw_user_meta_data ->> 'license_number', '')
    )
    on conflict (id) do nothing;
  end if;

  return new;
end;
$$;
