-- Swaps the payment gateway from Mercado Pago to Asaas (the gateway actually used by the
-- business) across every payment touch point: single-session checkout, professional platform
-- subscription, Pix charges, and the confirmation webhook. `payments.provider`/`provider_payment_id`
-- and the Pix columns (pix_qr_code/pix_qr_code_base64/pix_expires_at/payment_link_url) are already
-- provider-agnostic text columns, so they're reused as-is — Asaas writes "asaas" into `provider`
-- going forward instead of "mercadopago". No real Mercado Pago payments ever went through this
-- project (MERCADOPAGO_ACCESS_TOKEN was never configured), so renaming rather than keeping both
-- columns is safe — there's no historical data shaped around the old name to preserve.
alter table public.professional_subscriptions rename column mp_preapproval_id to asaas_subscription_id;

-- Asaas requires a "customer" object (cpfCnpj, name, email) to charge against; cached here so we
-- create it once per professional/patient instead of on every single charge.
alter table public.professional_profiles add column asaas_customer_id text;
alter table public.patient_profiles add column asaas_customer_id text;
