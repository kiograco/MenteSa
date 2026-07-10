-- Points existing assessment_responses at the built-in templates seeded in the previous migration,
-- then fully replaces the old two-value `instrument` check constraint with a proper FK — new
-- responses (including ones answering a professional's own custom template) just reference
-- assessment_templates.id instead of being limited to a hardcoded ('phq9','gad7') text value.
alter table public.assessment_responses add column template_id uuid references public.assessment_templates (id);

update public.assessment_responses set template_id = '00000000-0000-0000-0000-000000000001' where instrument = 'phq9';
update public.assessment_responses set template_id = '00000000-0000-0000-0000-000000000002' where instrument = 'gad7';

alter table public.assessment_responses alter column template_id set not null;
alter table public.assessment_responses drop column instrument;
