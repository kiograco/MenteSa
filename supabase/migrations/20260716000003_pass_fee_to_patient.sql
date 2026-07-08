-- Toggle: when on, the platform commission (PLATFORM_FEE_RATE, currently hardcoded 10% in
-- payment-provider.ts / create-mp-preference / create-pix-charge / mercadopago-webhook) is added on
-- top of the session price and charged to the patient, instead of being deducted from what the
-- professional receives. What the professional nets never changes either way — only who pays the
-- commission changes.
alter table public.professional_profiles add column pass_fee_to_patient boolean not null default false;
