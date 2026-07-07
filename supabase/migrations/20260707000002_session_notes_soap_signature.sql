-- Structured SOAP clinical note (Subjetivo/Objetivo/Avaliação/Plano) plus an e-signature for the
-- treating professional, replacing the single free-text `notes` field as the primary way to
-- document a session. `notes` is kept (not dropped) so existing clinical records stay readable.
alter table public.session_notes
  add column subjective text,
  add column objective text,
  add column assessment text,
  add column plan text,
  add column signed_at timestamptz,
  add column typed_name text,
  add column signature_hash text;

-- Without this, "assinatura digital" would be theater: the professional could sign, then keep
-- editing the SOAP text with the old signature/timestamp still attached. Once signed_at is set the
-- clinical content is frozen at the database level, not just hidden behind a disabled UI control —
-- the same posture as consent_signatures/reviews being append-only, but enforced with a trigger
-- here because this table's clinical fields are otherwise legitimately editable pre-signature.
create function public.prevent_session_note_edit_after_sign()
returns trigger
language plpgsql
as $$
begin
  if old.signed_at is not null and (
    new.subjective is distinct from old.subjective
    or new.objective is distinct from old.objective
    or new.assessment is distinct from old.assessment
    or new.plan is distinct from old.plan
    or new.signed_at is distinct from old.signed_at
    or new.typed_name is distinct from old.typed_name
    or new.signature_hash is distinct from old.signature_hash
  ) then
    raise exception 'Esta nota já foi assinada digitalmente e não pode mais ser alterada.';
  end if;
  return new;
end;
$$;

create trigger session_notes_prevent_edit_after_sign
  before update on public.session_notes
  for each row execute procedure public.prevent_session_note_edit_after_sign();
