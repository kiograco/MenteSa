// Creates a Mercado Pago recurring subscription ("preapproval") for a professional to pay the
// platform, separate from create-mp-preference (which charges the PATIENT for a single
// appointment). Mirrors that function's auth pattern; the actual API call targets MP's
// /preapproval endpoint instead of /checkout/preferences, since preapproval is what sets up
// recurring billing rather than a one-off charge.
//
// Deploy: supabase functions deploy create-mp-subscription
// Secrets: reuses MERCADOPAGO_ACCESS_TOKEN / APP_BASE_URL (already set for create-mp-preference)
import { createClient } from "npm:@supabase/supabase-js@2";

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

    const { planId } = await req.json();
    if (!planId) return json({ error: "planId is required." }, 400);

    const accessToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
    if (!accessToken) return json({ error: "MERCADOPAGO_ACCESS_TOKEN não configurado nos secrets da função." }, 500);

    const appBaseUrl = Deno.env.get("APP_BASE_URL") ?? "";

    const callerClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData.user) return json({ error: "Sessão inválida." }, 401);

    const adminClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: callerProfile } = await adminClient.from("profiles").select("role").eq("id", userData.user.id).maybeSingle();
    if (callerProfile?.role !== "professional") return json({ error: "Acesso negado." }, 403);

    const { data: plan, error: planError } = await adminClient.from("subscription_plans").select("id, name, price").eq("id", planId).maybeSingle();
    if (planError || !plan) return json({ error: "Plano não encontrado." }, 404);

    const { data: payerAuth } = await adminClient.auth.admin.getUserById(userData.user.id);
    const payerEmail = payerAuth.user?.email;
    if (!payerEmail) return json({ error: "Não foi possível identificar seu e-mail para a assinatura." }, 422);

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
    } else {
      const { data: inserted, error: insertError } = await adminClient
        .from("professional_subscriptions")
        .insert({ professional_id: userData.user.id, plan_id: planId, status: "pending" })
        .select("id")
        .single();
      if (insertError || !inserted) return json({ error: insertError?.message ?? "Não foi possível iniciar a assinatura." }, 500);
      subscriptionId = inserted.id;
      createdNewRow = true;
    }

    const preapprovalResponse = await fetch("https://api.mercadopago.com/preapproval", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        reason: plan.name,
        auto_recurring: {
          frequency: 1,
          frequency_type: "months",
          transaction_amount: Number(plan.price),
          currency_id: "BRL",
        },
        back_url: `${appBaseUrl}/profissional/configuracoes`,
        payer_email: payerEmail,
        external_reference: subscriptionId,
        notification_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/mercadopago-webhook`,
      }),
    });

    if (!preapprovalResponse.ok) {
      // Only clean up a row this call created — a pending row that already existed before this
      // call (e.g. from signup) stays, so the professional can just retry "Pagar agora".
      if (createdNewRow) await adminClient.from("professional_subscriptions").delete().eq("id", subscriptionId);
      return json({ error: `Falha ao criar assinatura no Mercado Pago: ${await preapprovalResponse.text()}` }, 502);
    }

    const preapproval = await preapprovalResponse.json();
    await adminClient.from("professional_subscriptions").update({ mp_preapproval_id: preapproval.id }).eq("id", subscriptionId);

    return json({ initPoint: preapproval.init_point });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Erro desconhecido." }, 500);
  }
});
