-- Cupons de desconto para a assinatura da plataforma (professional_subscriptions/subscription_plans),
-- administrados exclusivamente pelo admin. Não se aplicam ao pagamento de sessão do paciente
-- (payments/create-mp-preference) — esse fluxo fica fora de escopo por decisão de produto.
--
-- Códigos nunca são expostos por uma policy de select pública: validação e resgate passam sempre
-- por edge functions com service role (validate-coupon para pré-visualizar o desconto,
-- create-mp-subscription para de fato aplicar e registrar o resgate), mesmo trust boundary já usado
-- para professional_subscriptions/payments. O admin lê/escreve a tabela diretamente via RLS
-- (public.is_admin()), sem precisar de função dedicada, seguindo o padrão de
-- professional_profiles_update_own.
create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  discount_type text not null check (discount_type in ('percentage', 'fixed')),
  discount_value numeric(10, 2) not null check (discount_value > 0),
  max_redemptions integer check (max_redemptions is null or max_redemptions > 0),
  max_redemptions_per_user integer not null default 1 check (max_redemptions_per_user > 0),
  redemption_count integer not null default 0,
  active boolean not null default true,
  starts_at timestamptz,
  expires_at timestamptz,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Um resgate por assinatura criada com sucesso — histórico de quem usou qual cupom, e a base para
-- aplicar o limite "max_redemptions_per_user".
create table public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons (id) on delete cascade,
  professional_id uuid not null references public.professional_profiles (id) on delete cascade,
  subscription_id uuid references public.professional_subscriptions (id) on delete set null,
  discount_amount numeric(10, 2) not null,
  redeemed_at timestamptz not null default now()
);

-- Guarda o cupom aplicado (se houver) diretamente na assinatura, para exibir na tela "Meu plano" e
-- no painel financeiro do admin sem precisar de join extra com coupon_redemptions.
alter table public.professional_subscriptions add column coupon_id uuid references public.coupons (id);
alter table public.professional_subscriptions add column discount_amount numeric(10, 2);

alter table public.coupons enable row level security;
alter table public.coupon_redemptions enable row level security;

create policy "coupons_all_admin" on public.coupons for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "coupon_redemptions_select_own_or_admin" on public.coupon_redemptions for select
  using (auth.uid() = professional_id or public.is_admin());

-- Sem insert/update policy para coupon_redemptions: só validate-coupon/create-mp-subscription
-- (service role) gravam aqui, mesmo padrão de professional_subscriptions.

create index coupons_code_idx on public.coupons (code);
create index coupon_redemptions_coupon_id_idx on public.coupon_redemptions (coupon_id);
create index coupon_redemptions_professional_id_idx on public.coupon_redemptions (professional_id);

-- Atomic increment for create-mp-subscription (service role) to bump redemption_count without a
-- read-then-write race between two professionals redeeming the last unit of a limited coupon.
create function public.increment_coupon_redemption(p_coupon_id uuid) returns void
language sql
as $$
  update public.coupons set redemption_count = redemption_count + 1 where id = p_coupon_id;
$$;
