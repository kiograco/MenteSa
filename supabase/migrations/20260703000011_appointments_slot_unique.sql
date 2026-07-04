-- Booking today only prevents double-booking via a check-then-insert in the client
-- (CheckoutScreen.handlePayment), which is a real race condition — two patients paying at nearly
-- the same instant for the same slot could both succeed. This partial unique index makes it
-- impossible at the database level: only one 'scheduled' row can exist per professional+time.
-- Needed for the waitlist feature too, where multiple people may race to claim a freed slot.
create unique index appointments_professional_slot_active_key
  on public.appointments (professional_id, scheduled_at)
  where status = 'scheduled';
