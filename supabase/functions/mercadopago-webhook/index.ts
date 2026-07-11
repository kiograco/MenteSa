// Supabase Edge Function: Mercado Pago webhook (IPN). This is the ONLY source of truth for
// whether an appointment was actually paid — never trust the client-side redirect back_urls,
// they can be skipped, replayed, or spoofed. Mercado Pago calls this with just a payment id;
// we then fetch the real payment status from their API ourselves before writing anything.
//
// Deploy: supabase functions deploy mercadopago-webhook --no-verify-jwt
// (--no-verify-jwt is required: Mercado Pago calls this without a Supabase auth token)
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendBookingConfirmationEmail } from "../_shared/email.ts";

const PLATFORM_FEE_RATE = 0.1;

/** Professional-subscription branch (create-mp-subscription): a distinct notification shape from
 *  the appointment-payment flow below — MP calls back with a preapproval id, not a payment id, and
 *  the resource lives at a different endpoint. Handled first so the generic
 *  "topic !== payment -> ignored" check further down never sees these. Only the base
 *  authorized/cancelled/pending states are tracked; individual recurring charges
 *  (subscription_authorized_payment) aren't recorded per-cycle in this pass — out of scope for now,
 *  same "ship the real mechanism, flag what's deferred" posture as the placeholder plan price. */
async function handleSubscriptionNotification(preapprovalId: string, accessToken: string, supabaseUrl: string, serviceRoleKey: string): Promise<Response> {
  const preapprovalResponse = await fetch(`https://api.mercadopago.com/preapproval/${preapprovalId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!preapprovalResponse.ok) return new Response(JSON.stringify({ error: "Preapproval not found upstream." }), { status: 200 });

  const preapproval = await preapprovalResponse.json();
  const subscriptionId: string | undefined = preapproval.external_reference;
  if (!subscriptionId) return new Response(JSON.stringify({ ignored: true }), { status: 200 });

  let status: "active" | "cancelled" | "pending" | null = null;
  if (preapproval.status === "authorized") status = "active";
  else if (preapproval.status === "cancelled") status = "cancelled";
  else if (preapproval.status === "pending") status = "pending";
  if (!status) return new Response(JSON.stringify({ ignored: true, mpStatus: preapproval.status }), { status: 200 });

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  // Approximated as "one month from now" (matches the monthly billing_interval seeded for every
  // plan today) rather than trusting an MP field for the next charge date — safer than guessing at
  // an API response shape that isn't verified here.
  const currentPeriodEnd = status === "active" ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() : null;

  const { error } = await supabase
    .from("professional_subscriptions")
    .update({ status, mp_preapproval_id: preapproval.id, current_period_end: currentPeriodEnd, updated_at: new Date().toISOString() })
    .eq("id", subscriptionId);

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}

Deno.serve(async req => {
  try {
    const url = new URL(req.url);
    const paymentId = url.searchParams.get("data.id") ?? url.searchParams.get("id");
    const topic = url.searchParams.get("type") ?? url.searchParams.get("topic");

    const accessToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
    if (!accessToken) return new Response(JSON.stringify({ error: "MERCADOPAGO_ACCESS_TOKEN não configurado." }), { status: 500 });

    if (topic === "subscription_preapproval" || topic === "preapproval") {
      if (!paymentId) return new Response(JSON.stringify({ ignored: true }), { status: 200 });
      return handleSubscriptionNotification(paymentId, accessToken, Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    }

    // Mercado Pago also pings this endpoint for non-payment topics (merchant_order, etc.) — ignore those.
    if (!paymentId || (topic && topic !== "payment")) {
      return new Response(JSON.stringify({ ignored: true }), { status: 200 });
    }

    const paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!paymentResponse.ok) {
      // Ack with 200 anyway so Mercado Pago doesn't retry forever on a payment id that doesn't exist for us.
      return new Response(JSON.stringify({ error: "Payment not found upstream." }), { status: 200 });
    }

    const payment = await paymentResponse.json();
    const appointmentId: string | undefined = payment.external_reference;
    if (!appointmentId) return new Response(JSON.stringify({ ignored: true }), { status: 200 });

    let status: "paid" | "refunded" | "pending" | null = null;
    if (payment.status === "approved") status = "paid";
    else if (payment.status === "refunded" || payment.status === "charged_back") status = "refunded";
    else if (payment.status === "pending" || payment.status === "in_process") status = "pending";
    // rejected/cancelled: leave status null — nothing to record, the patient can retry checkout.

    if (!status) return new Response(JSON.stringify({ ignored: true, mpStatus: payment.status }), { status: 200 });

    // Service role: this request has no user session (it's Mercado Pago calling us), so RLS can't apply here.
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // amount is whatever MP actually charged/received — with "repassar taxa ao paciente" on, that
    // already includes the commission surcharge (create-mp-preference/create-pix-charge). The
    // commission itself is always computed off the appointment's own base price, never off the
    // charged total, so what the professional nets (amount - platform_fee) stays the session price
    // either way — only who paid the extra 10% changes.
    const amount = Number(payment.transaction_amount ?? 0);
    const { data: appointmentRow } = await supabase.from("appointments").select("price").eq("id", appointmentId).maybeSingle();
    const basePrice = Number(appointmentRow?.price ?? amount);
    const platformFee = Number((basePrice * PLATFORM_FEE_RATE).toFixed(2));

    const { data: existingPayment } = await supabase
      .from("payments")
      .select("status")
      .eq("provider_payment_id", String(payment.id))
      .maybeSingle();
    const alreadyPaid = existingPayment?.status === "paid";

    const { error } = await supabase.from("payments").upsert(
      {
        appointment_id: appointmentId,
        status,
        method: payment.payment_type_id ?? "mercadopago",
        amount,
        platform_fee: platformFee,
        provider: "mercadopago",
        provider_payment_id: String(payment.id),
      },
      { onConflict: "provider_payment_id" }
    );

    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

    // Best-effort, and only on the first time this payment is recorded as paid (avoids duplicate
    // e-mails when Mercado Pago redelivers the same notification).
    if (status === "paid" && !alreadyPaid) {
      await sendBookingConfirmationEmail(supabase, appointmentId).catch(() => {});
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido." }), { status: 500 });
  }
});
