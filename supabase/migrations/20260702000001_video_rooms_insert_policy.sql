-- The initial schema only granted SELECT on video_rooms (intended for a service-role Edge
-- Function). The MVP creates the mock room client-side right after checkout, so an appointment
-- participant needs INSERT rights on their own appointment's room.
create policy "video_rooms_insert_participant" on public.video_rooms for insert
  with check (
    exists (
      select 1 from public.appointments a
      where a.id = video_rooms.appointment_id
        and (a.patient_id = auth.uid() or a.professional_id = auth.uid())
    )
  );
