-- session_notes was missing the unique constraint that video_rooms/reviews already have on
-- appointment_id, even though the product is one editable clinical note per session. Without it,
-- an upsert keyed on appointment_id has no conflict target to resolve against.
alter table public.session_notes
  add constraint session_notes_appointment_id_key unique (appointment_id);
