-- "Prontuário rico": the 4 SOAP fields move from plain text to Tiptap's JSON document format
-- (jsonb), so the professional can format text and embed images. Existing text is wrapped in a
-- minimal valid Tiptap doc (a single paragraph node) so already-signed notes stay readable —
-- session_notes_prevent_edit_after_sign (migration 20260707000002) compares with `is distinct
-- from`, which works the same on jsonb as it did on text, so the immutability guarantee is
-- unaffected.
alter table public.session_notes
  alter column subjective type jsonb using (
    case when subjective is null or subjective = '' then null
    else jsonb_build_object('type', 'doc', 'content', jsonb_build_array(
      jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array(
        jsonb_build_object('type', 'text', 'text', subjective)
      ))
    )) end
  ),
  alter column objective type jsonb using (
    case when objective is null or objective = '' then null
    else jsonb_build_object('type', 'doc', 'content', jsonb_build_array(
      jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array(
        jsonb_build_object('type', 'text', 'text', objective)
      ))
    )) end
  ),
  alter column assessment type jsonb using (
    case when assessment is null or assessment = '' then null
    else jsonb_build_object('type', 'doc', 'content', jsonb_build_array(
      jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array(
        jsonb_build_object('type', 'text', 'text', assessment)
      ))
    )) end
  ),
  alter column plan type jsonb using (
    case when plan is null or plan = '' then null
    else jsonb_build_object('type', 'doc', 'content', jsonb_build_array(
      jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array(
        jsonb_build_object('type', 'text', 'text', plan)
      ))
    )) end
  );
