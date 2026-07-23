// Creates an Asaas recurring subscription for a professional to pay the platform, separate from
// create-asaas-preference (which charges the PATIENT for a single appointment). Unlike Mercado
// Pago's preapproval (which returns a single hosted-checkout URL directly), Asaas only returns the
// subscription id — the first generated charge has to be fetched separately to get its invoiceUrl.
//
// NOTE: billingType "UNDEFINED" is used so the professional can pick Pix/boleto/card on Asaas's own
// page, same as create-asaas-preference. Asaas's reference docs list BOLETO/CREDIT_CARD/PIX as the
// documented enum for /v3/subscriptions specifically — if your account rejects UNDEFINED here,
// switch to a fixed billingType (e.g. "PIX") or collect the professional's preferred method in the
// UI before calling this function.
//
// Deploy: supabase functions deploy create-asaas-subscription
// Secrets: reuses ASAAS_API_KEY / APP_BASE_URL (already set for create-asaas-preference)
import { createClient } from "npm:@supabase/supabase-js@2";
import { asaasFetch, getOrCreateAsaasCustomer, todayIsoDate } from "../_shared/asaasClient.ts";
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

    const { planId, couponCode } = await req.json();
    if (!planId) return json({ error: "planId is required." }, 400);

    const apiKey = Deno.env.get("ASAAS_API_KEY");
    if (!apiKey) return json({ error: "ASAAS_API_KEY não configurado nos secrets da função." }, 500);

    const appBaseUrl = Deno.env.get("APP_BASE_URL") ?? "";

    const callerClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData.user) return json({ error: "Sessão inválida." }, 401);

    const adminClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: callerProfile } = await adminClient.from("profiles").select("full_name, role").eq("id", userData.user.id).maybeSingle();
    if (callerProfile?.role !== "professional") return json({ error: "Acesso negado." }, 403);

    const { data: plan, error: planError } = await adminClient.from("subscription_plans").select("id, name, price").eq("id", planId).maybeSingle();
    if (planError || !plan) return json({ error: "Plano não encontrado." }, 404);

    // Re-validated here even though validate-coupon already previewed it client-side — that call
    // is read-only, so a code that was valid a moment ago could have expired or hit its usage cap
    // by the time the professional actually clicks "Assinar". This is the one place a coupon is
    // ever actually redeemed (coupon_redemptions insert + redemption_count bump), gated on this
    // subscription call succeeding, not on the client-side preview.
    let subscriptionValue = Number(plan.price);
    let appliedCouponId: string | null = null;
    let appliedDiscountAmount: number | null = null;
    if (couponCode) {
      const resolution = await resolveCoupon(adminClient, couponCode, userData.user.id, Number(plan.price));
      if (!resolution.ok) return json({ error: resolution.error }, 400);
      subscriptionValue = resolution.discountedPrice;
      appliedCouponId = resolution.coupon.id;
      appliedDiscountAmount = resolution.discountAmount;
    }

    // Reuse an existing pending row for this exact plan if one's already there — signup
    // (handle_new_user trigger) creates one the moment a professional picks a plan, before any
    // session exists to call this function with, so the first time they click "Pagar agora" this
    // is very likely already sitting here. Falls back to inserting a fresh one for "Assinar" from
    // Configurações when there isn't a pending row yet (e.g. changing plans after a cancellation).
    const { data: existingPending } = await adminClient
      .from("professional_subscriptions")
      .select("id")
      .eq("professional_id", userData.user.id)
      .eq("plan_id", planId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let subscriptionId: string;
    let createdNewRow = false;

    if (existingPending) {
      subscriptionId = existingPending.id;
      // Overwrite whatever coupon fields the row already had (e.g. none, from signup) with this
      // attempt's — the row isn't considered "redeemed" until the subscription below actually succeeds.
      await adminClient
        .from("professional_subscriptions")
        .update({ coupon_id: appliedCouponId, discount_amount: appliedDiscountAmount })
        .eq("id", subscriptionId);
    } else {
      const { data: inserted, error: insertError } = await adminClient
        .from("professional_subscriptions")
        .insert({
          professional_id: userData.user.id,
          plan_id: planId,
          status: "pending",
          coupon_id: appliedCouponId,
          discount_amount: appliedDiscountAmount,
        })
        .select("id")
        .single();
      if (insertError || !inserted) return json({ error: insertError?.message ?? "Não foi possível iniciar a assinatura." }, 500);
      subscriptionId = inserted.id;
      createdNewRow = true;
    }

    // A 100%-off coupon (or a fixed discount >= the plan price) leaves nothing to charge — Asaas
    // rejects a subscription/payment created with value 0 ("O parâmetro value deve ser informado"),
    // so there's no gateway charge to create at all here. Skip Asaas entirely and activate the
    // subscription directly. current_period_end is approximated as one billing cycle from now (same
    // posture as the old Mercado Pago webhook) since there's no Asaas subscription to track renewal
    // through — after that date the professional needs to subscribe again, with or without a coupon.
    if (subscriptionValue <= 0) {
      const currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const { error: activateError } = await adminClient
        .from("professional_subscriptions")
        .update({ status: "active", current_period_end: currentPeriodEnd, updated_at: new Date().toISOString() })
        .eq("id", subscriptionId);
      if (activateError) return json({ error: activateError.message }, 500);

      if (appliedCouponId) {
        await adminClient.from("coupon_redemptions").insert({
          coupon_id: appliedCouponId,
          professional_id: userData.user.id,
          subscription_id: subscriptionId,
          discount_amount: appliedDiscountAmount,
        });
        await adminClient.rpc("increment_coupon_redemption", { p_coupon_id: appliedCouponId });
      }

      return json({ checkoutUrl: null });
    }

    // Asaas requires a cpfCnpj to create the customer that gets charged — Pessoa Jurídica uses the
    // CNPJ/razão social instead of the professional's own CPF/name.
    const { data: profRow } = await adminClient
      .from("professional_profiles")
      .select("cpf, cnpj, razao_social, person_type")
      .eq("id", userData.user.id)
      .maybeSingle();
    const cpfCnpj = profRow?.person_type === "juridica" ? profRow?.cnpj : profRow?.cpf;
    if (!cpfCnpj) return json({ error: "Informe seu CPF/CNPJ em Configurações antes de assinar." }, 422);

    const { data: payerAuth } = await adminClient.auth.admin.getUserById(userData.user.id);
    const payerEmail = payerAuth.user?.email;
    if (!payerEmail) return json({ error: "Não foi possível identificar seu e-mail para a assinatura." }, 422);

    const customer = await getOrCreateAsaasCustomer(adminClient, "professional_profiles", userData.user.id, apiKey, {
      name: (profRow?.person_type === "juridica" ? profRow?.razao_social : callerProfile?.full_name) ?? "Profissional",
      email: payerEmail,
      cpfCnpj,
    });
    if (!customer.ok) return json({ error: customer.error }, 502);

    const subscriptionResponse = await asaasFetch("/subscriptions", apiKey, {
      method: "POST",
      body: JSON.stringify({
        customer: customer.customerId,
        billingType: "UNDEFINED",
        value: subscriptionValue,
        nextDueDate: todayIsoDate(),
        cycle: "MONTHLY",
        description: plan.name,
        externalReference: subscriptionId,
        callback: { successUrl: `${appBaseUrl}/profissional/configuracoes`, autoRedirect: true },
      }),
    });

    if (!subscriptionResponse.ok) {
      // Only clean up a row this call created — a pending row that already existed before this
      // call (e.g. from signup) stays, so the professional can just retry "Pagar agora".
      if (createdNewRow) await adminClient.from("professional_subscriptions").delete().eq("id", subscriptionId);
      return json({ error: `Falha ao criar assinatura no Asaas: ${await subscriptionResponse.text()}` }, 502);
    }

    const subscription = await subscriptionResponse.json();
    await adminClient.from("professional_subscriptions").update({ asaas_subscription_id: subscription.id }).eq("id", subscriptionId);

    if (appliedCouponId) {
      await adminClient.from("coupon_redemptions").insert({
        coupon_id: appliedCouponId,
        professional_id: userData.user.id,
        subscription_id: subscriptionId,
        discount_amount: appliedDiscountAmount,
      });
      await adminClient.rpc("increment_coupon_redemption", { p_coupon_id: appliedCouponId });
    }

    // The subscription object itself has no invoiceUrl — fetch the first charge it generated.
    const firstPaymentResponse = await asaasFetch(`/subscriptions/${subscription.id}/payments`, apiKey);
    if (!firstPaymentResponse.ok) {
      return json({ error: `Assinatura criada, mas não foi possível obter o link de pagamento: ${await firstPaymentResponse.text()}` }, 502);
    }
    const firstPayments = await firstPaymentResponse.json();
    const checkoutUrl = firstPayments?.data?.[0]?.invoiceUrl;
    if (!checkoutUrl) return json({ error: "Assinatura criada, mas o Asaas não retornou um link de pagamento." }, 502);

    return json({ checkoutUrl });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Erro desconhecido." }, 500);
  }
});
