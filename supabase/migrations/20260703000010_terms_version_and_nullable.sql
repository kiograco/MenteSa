-- terms_accepted_at previously had `not null default now()`, so every new profile "proved"
-- consent at the instant its row was created in the database, not at the instant the person
-- actually checked the acceptance box (the client never wrote to this column at all). Dropping
-- the default stops fabricating consent going forward; existing rows keep whatever timestamp
-- they already have. The app now sets both columns explicitly the first time it sees an
-- authenticated session with a null terms_accepted_at (see App()'s loadAppUser).
alter table public.profiles alter column terms_accepted_at drop not null;
alter table public.profiles alter column terms_accepted_at drop default;
alter table public.profiles add column terms_version text;
