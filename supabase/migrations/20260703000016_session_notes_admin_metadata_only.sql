-- The old session_notes RLS let admin read full clinical note content (notes/ai_summary),
-- contradicting what the Privacy Policy already promised patients ("visíveis apenas para o
-- profissional responsável... nunca para outros usuários"). Removes that bypass entirely — admin
-- now has zero direct access to this table.
drop policy "session_notes_professional_only" on public.session_notes;

create policy "session_notes_professional_only" on public.session_notes for all
  using (auth.uid() = professional_id)
  with check (auth.uid() = professional_id);

-- Admin still needs basic oversight (how many notes exist, whether AI was used) without ever
-- touching the actual clinical text. This function is security definer (bypasses RLS, same
-- pattern as is_admin()/handle_new_user() already in this schema) but only ever returns
-- non-content columns — notes/ai_summary are read internally just to compute booleans, the raw
-- text itself never leaves the database. Checks is_admin() itself so a non-admin caller just gets
-- an empty result, never an error that would hint at the function's existence being sensitive.
create or replace function public.admin_session_notes_overview()
returns table (
  id uuid,
  appointment_id uuid,
  professional_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  has_notes boolean,
  has_ai_summary boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select id, appointment_id, professional_id, created_at, updated_at,
         (notes is not null and notes <> '') as has_notes,
         (ai_summary is not null) as has_ai_summary
  from public.session_notes
  where public.is_admin();
$$;

grant execute on function public.admin_session_notes_overview() to authenticated;
