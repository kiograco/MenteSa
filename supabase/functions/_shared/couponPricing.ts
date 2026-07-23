// Shared by validate-coupon (read-only preview, called while the professional is still typing a
// code in) and create-mp-subscription (the actual redemption, called right before the Mercado
// Pago preapproval is created). Both need the exact same eligibility rules — only the read-only
// vs. redeeming behavior differs — so a code that previews as valid is guaranteed to redeem the
// same way moments later, short of a genuine race on max_redemptions.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type CouponResolution =
  | {
      ok: true;
      coupon: { id: string; discount_type: "percentage" | "fixed"; discount_value: number };
      discountAmount: number;
      discountedPrice: number;
    }
  | { ok: false; error: string };

/** Looks up `code`, checks it's active/within its date window/under its usage caps for
 *  `professionalId`, and computes the discount against `price`. Does not write anything — callers
 *  that redeem the coupon are responsible for inserting into coupon_redemptions and bumping
 *  redemption_count themselves, inside their own success path. */
export async function resolveCoupon(
  adminClient: SupabaseClient,
  code: string,
  professionalId: string,
  price: number
): Promise<CouponResolution> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return { ok: false, error: "Informe um código de cupom." };

  const { data: coupon, error } = await adminClient.from("coupons").select("*").eq("code", normalized).maybeSingle();
  if (error) return { ok: false, error: "Não foi possível validar o cupom." };
  if (!coupon || !coupon.active) return { ok: false, error: "Cupom inválido ou inativo." };

  const now = Date.now();
  if (coupon.starts_at && new Date(coupon.starts_at).getTime() > now) return { ok: false, error: "Este cupom ainda não está disponível." };
  if (coupon.expires_at && new Date(coupon.expires_at).getTime() < now) return { ok: false, error: "Este cupom expirou." };
  if (coupon.max_redemptions !== null && coupon.redemption_count >= coupon.max_redemptions) {
    return { ok: false, error: "Este cupom atingiu o limite de usos." };
  }

  const { count: usedByProfessional } = await adminClient
    .from("coupon_redemptions")
    .select("id", { count: "exact", head: true })
    .eq("coupon_id", coupon.id)
    .eq("professional_id", professionalId);
  if ((usedByProfessional ?? 0) >= coupon.max_redemptions_per_user) {
    return { ok: false, error: "Você já utilizou esse cupom." };
  }

  const discountAmount =
    coupon.discount_type === "percentage"
      ? Number(((price * Number(coupon.discount_value)) / 100).toFixed(2))
      : Math.min(Number(coupon.discount_value), price);
  const discountedPrice = Number(Math.max(price - discountAmount, 0).toFixed(2));

  return {
    ok: true,
    coupon: { id: coupon.id, discount_type: coupon.discount_type, discount_value: Number(coupon.discount_value) },
    discountAmount,
    discountedPrice,
  };
}
