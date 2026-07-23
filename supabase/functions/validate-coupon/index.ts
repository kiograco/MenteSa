// Read-only preview: lets a professional see the discounted price for a plan before actually
// subscribing. Coupons are never exposed via a public/select RLS policy (codes would leak), so
// this — and the redemption inside create-mp-subscription — are the only ways to read a coupon
// row, both via a service-role client. Mirrors create-mp-subscription's auth pattern.
// Deploy: supabase functions deploy validate-coupon
import { createClient } from "npm:@supabase/supabase-js@2";
import { resolveCoupon } from "../_shared/couponPricing.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header." }, 401);

    const { code, planId } = await req.json();
    if (!code || !planId) return json({ valid: false, error: "code e planId são obrigatórios." }, 400);

    const callerClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData.user) return json({ error: "Sessão inválida." }, 401);

    const adminClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: callerProfile } = await adminClient.from("profiles").select("role").eq("id", userData.user.id).maybeSingle();
    if (callerProfile?.role !== "professional") return json({ valid: false, error: "Acesso negado." }, 403);

    const { data: plan } = await adminClient.from("subscription_plans").select("price").eq("id", planId).maybeSingle();
    if (!plan) return json({ valid: false, error: "Plano não encontrado." }, 404);

    const resolution = await resolveCoupon(adminClient, code, userData.user.id, Number(plan.price));
    if (!resolution.ok) return json({ valid: false, error: resolution.error });

    return json({
      valid: true,
      discountType: resolution.coupon.discount_type,
      discountValue: resolution.coupon.discount_value,
      originalPrice: Number(plan.price),
      discountedPrice: resolution.discountedPrice,
    });
  } catch (error) {
    return json({ valid: false, error: error instanceof Error ? error.message : "Erro desconhecido." }, 500);
  }
});
