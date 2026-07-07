-- Supports two Financeiro features: an on-demand Pix charge (create-pix-charge Edge Function,
-- direct Mercado Pago Payments API rather than Checkout Pro, since only the direct API returns a
-- QR code/copia-e-cola string) and a reusable payment link shown outside the booking flow.
-- paid_at is denormalized separately from created_at so a recibo can show the moment the payment
-- actually cleared, not when the (possibly still-pending) row was first inserted.
alter table public.payments
  add column paid_at timestamptz,
  add column pix_qr_code text,
  add column pix_qr_code_base64 text,
  add column pix_expires_at timestamptz,
  add column payment_link_url text;
