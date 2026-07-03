-- Mercado Pago webhooks can (and do) redeliver the same notification more than once.
-- provider_payment_id lets the webhook upsert idempotently instead of creating duplicate rows.
-- Partial unique index: mock payments never set this column, so they're unaffected.
alter table public.payments
  add column provider_payment_id text;

create unique index payments_provider_payment_id_key
  on public.payments (provider_payment_id)
  where provider_payment_id is not null;
