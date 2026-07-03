-- Minimal audit trail for AI involvement in a clinical note: set only when a professional saves
-- a session with a freshly-generated (and consented-to) AI summary. Nullable — most rows won't
-- have it if the professional never used the AI assistant or wrote notes manually.
alter table public.session_notes
  add column ai_summary_generated_at timestamptz;
