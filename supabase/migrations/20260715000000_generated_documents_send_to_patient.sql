-- "Enviar para o paciente" as an explicit action, separate from generating/signing a document —
-- a recibo or declaração only becomes visible to the patient once the professional deliberately
-- sends it (e.g. a laudo mid-revision, or a parecer meant for a third party, shouldn't show up in
-- the patient's own document list just because it exists). sent_to_patient_at is both the flag and
-- the record of when it was sent.
alter table public.generated_documents add column sent_to_patient_at timestamptz;

drop policy "generated_documents_select" on public.generated_documents;

-- Professional sees every document they generated for their patients, sent or not.
create policy "generated_documents_select_professional" on public.generated_documents for select
  using (auth.uid() = professional_id or public.is_admin());

-- Patient only sees documents explicitly sent to them.
create policy "generated_documents_select_patient" on public.generated_documents for select
  using (auth.uid() = patient_id and sent_to_patient_at is not null);

-- Lets the owning professional flip sent_to_patient_at (and only that — the signed clinical
-- content itself has no update policy at all, same as before, so it stays immutable once signed).
create policy "generated_documents_update_professional" on public.generated_documents for update
  using (auth.uid() = professional_id)
  with check (auth.uid() = professional_id);
