// Supabase Edge Function: Mercado Pago webhook (IPN). This is the ONLY source of truth for
// whether an appointment was actually paid — never trust the client-side redirect back_urls,
// they can be skipped, replayed, or spoofed. Mercado Pago calls this with just a payment id;
// we then fetch the real payment status from their API ourselves before writing anything.
//
// Deploy: supabase functions deploy mercadopago-webhook --no-verify-jwt
// (--no-verify-jwt is required: Mercado Pago calls this without a Supabase auth token)
import { createClient } from "npm:@supabase/supabase-js@2";

const PLATFORM_FEE_RATE = 0.1;

Deno.serve(async req => {
  try {
    const url = new URL(req.url);
    const paymentId = url.searchParams.get("data.id") ?? url.searchParams.get("id");
    const topic = url.searchParams.get("type") ?? url.searchParams.get("topic");

    // Mercado Pago also pings this endpoint for non-payment topics (merchant_order, etc.) — ignore those.
    if (!paymentId || (topic && topic !== "payment")) {
      return new Response(JSON.stringify({ ignored: true }), { status: 200 });
    }

    const accessToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
    if (!accessToken) return new Response(JSON.stringify({ error: "MERCADOPAGO_ACCESS_TOKEN não configurado." }), { status: 500 });

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

    const amount = Number(payment.transaction_amount ?? 0);

    const { error } = await supabase.from("payments").upsert(
      {
        appointment_id: appointmentId,
        status,
        method: payment.payment_type_id ?? "mercadopago",
        amount,
        platform_fee: Number((amount * PLATFORM_FEE_RATE).toFixed(2)),
        provider: "mercadopago",
        provider_payment_id: String(payment.id),
      },
      { onConflict: "provider_payment_id" }
    );

    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido." }), { status: 500 });
  }
});
