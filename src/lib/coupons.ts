import { supabase } from "./supabase";
import { extractFunctionErrorMessage, invokeEdgeFunction } from "./functionsClient";
import type { Database } from "./database.types";

export type DiscountType = "percentage" | "fixed";

export type Coupon = {
  id: string;
  code: string;
  discountType: DiscountType;
  discountValue: number;
  maxRedemptions: number | null;
  maxRedemptionsPerUser: number;
  redemptionCount: number;
  active: boolean;
  startsAt: string | null;
  expiresAt: string | null;
  createdAt: string;
};

type CouponRow = Database["public"]["Tables"]["coupons"]["Row"];

function mapCoupon(row: CouponRow): Coupon {
  return {
    id: row.id,
    code: row.code,
    discountType: row.discount_type,
    discountValue: Number(row.discount_value),
    maxRedemptions: row.max_redemptions,
    maxRedemptionsPerUser: row.max_redemptions_per_user,
    redemptionCount: row.redemption_count,
    active: row.active,
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

/** Admin-only CRUD — enforced by the `coupons_all_admin` RLS policy, not by this code. Plain
 *  client writes suffice here (no `auth.admin.*` call is involved, unlike admin-manage-user). */
export async function listCoupons(): Promise<Coupon[]> {
  const { data, error } = await supabase.from("coupons").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapCoupon);
}

export async function createCoupon(input: {
  code: string;
  discountType: DiscountType;
  discountValue: number;
  maxRedemptions: number | null;
  maxRedemptionsPerUser: number;
  startsAt: string | null;
  expiresAt: string | null;
}): Promise<Coupon> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("coupons")
    .insert({
      code: input.code.trim().toUpperCase(),
      discount_type: input.discountType,
      discount_value: input.discountValue,
      max_redemptions: input.maxRedemptions,
      max_redemptions_per_user: input.maxRedemptionsPerUser,
      starts_at: input.startsAt,
      expires_at: input.expiresAt,
      created_by: user?.id ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapCoupon(data);
}

export async function setCouponActive(id: string, active: boolean): Promise<void> {
  const { error } = await supabase.from("coupons").update({ active }).eq("id", id);
  if (error) throw error;
}

export async function deleteCoupon(id: string): Promise<void> {
  const { error } = await supabase.from("coupons").delete().eq("id", id);
  if (error) throw error;
}

export type CouponPreview =
  | { valid: true; discountType: DiscountType; discountValue: number; originalPrice: number; discountedPrice: number }
  | { valid: false; error: string };

/** Read-only preview of a coupon code's discount for a given plan, so the professional sees the
 *  discounted price before actually subscribing. Doesn't redeem anything — `createSubscription`
 *  re-validates and performs the real redemption server-side, since a code can expire or hit its
 *  usage limit between preview and submit. */
export async function validateCoupon(code: string, planId: string): Promise<CouponPreview> {
  const { data, error } = await invokeEdgeFunction<CouponPreview>("validate-coupon", { body: { code, planId } });
  if (error || !data) {
    return { valid: false, error: (await extractFunctionErrorMessage(error)) ?? "Não foi possível validar o cupom." };
  }
  return data;
}
