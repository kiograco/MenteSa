// Creates an on-demand Pix charge for an existing appointment, via Mercado Pago's direct Payments
// API (not Checkout Pro, which never exposes a QR code/copia-e-cola to the app — only MP's own
// hosted page shows it to the payer). Lets a professional collect for a session that was created
// unpaid, decoupled from the booking-time flow in CheckoutScreen. Status transitions (pending ->
// paid) are still resolved exclusively by the existing mercadopago-webhook, keyed on
// provider_payment_id — this function only ever writes an initial "pending" row.
//
// Deploy: supabase functions deploy create-pix-charge
// Secrets: reuses MERCADOPAGO_ACCESS_TOKEN (already set for create-mp-preference)
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PLATFORM_FEE_RATE = 0.1;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header." }, 401);

    const { appointmentId } = await req.json();
    if (!appointmentId) return json({ error: "appointmentId is required." }, 400);

    const accessToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
    if (!accessToken) return json({ error: "MERCADOPAGO_ACCESS_TOKEN não configurado nos secrets da função." }, 500);

    const callerClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData.user) return json({ error: "Sessão inválida." }, 401);

    // RLS (appointments_select_participants) already restricts this to the appointment's own
    // patient/professional/admin — if the row comes back, the caller is allowed to charge it.
    const { data: appointment, error: apptError } = await callerClient
      .from("appointments")
      .select("id, patient_id, professional_id, price")
      .eq("id", appointmentId)
      .maybeSingle();

    if (apptError || !appointment) return json({ error: "Consulta não encontrada ou acesso negado." }, 404);
    if (appointment.patient_id !== userData.user.id && appointment.professional_id !== userData.user.id) {
      return json({ error: "Apenas o paciente ou o profissional da consulta podem gerar essa cobrança." }, 403);
    }

    const adminClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // When the professional opts to pass the platform commission on to the patient, the surcharge
    // is added to what's actually charged via Pix; mercadopago-webhook (and the platform_fee below)
    // always derive the commission from the appointment's base price, not the charged total, so
    // what the professional nets is the same either way.
    const { data: profRow } = await adminClient
      .from("professional_profiles")
      .select("pass_fee_to_patient")
      .eq("id", appointment.professional_id)
      .maybeSingle();
    const passFeeToPatient = Boolean(profRow?.pass_fee_to_patient);
    const basePrice = Number(appointment.price);
    const feeAmount = Number((basePrice * PLATFORM_FEE_RATE).toFixed(2));
    const chargedAmount = passFeeToPatient ? Number((basePrice + feeAmount).toFixed(2)) : basePrice;

    // Reuse an existing not-yet-expired Pix charge instead of generating a new QR code every time
    // "Cobrar via Pix" is clicked (avoids leaving a trail of abandoned MP payments per appointment).
    const { data: existing } = await adminClient
      .from("payments")
      .select("status, pix_qr_code, pix_qr_code_base64, pix_expires_at")
      .eq("appointment_id", appointmentId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.status === "paid") return json({ error: "Esta consulta já está paga." }, 409);
    if (existing?.status === "pending" && existing.pix_qr_code && existing.pix_expires_at && new Date(existing.pix_expires_at) > new Date()) {
      return json({ qrCode: existing.pix_qr_code, qrCodeBase64: existing.pix_qr_code_base64, expiresAt: existing.pix_expires_at });
    }

    const { data: patientAuth } = await adminClient.auth.admin.getUserById(appointment.patient_id);
    const payerEmail = patientAuth.user?.email;
    if (!payerEmail) return json({ error: "Não foi possível identificar o e-mail do paciente para gerar a cobrança." }, 422);

    const paymentResponse = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        transaction_amount: chargedAmount,
        description: passFeeToPatient ? "Consulta — MindCare (inclui taxa da plataforma)" : "Consulta — MindCare",
        payment_method_id: "pix",
        external_reference: appointmentId,
        payer: { email: payerEmail },
      }),
    });

    if (!paymentResponse.ok) {
      return json({ error: `Falha ao criar cobrança Pix no Mercado Pago: ${await paymentResponse.text()}` }, 502);
    }

    const payment = await paymentResponse.json();
    const transactionData = payment.point_of_interaction?.transaction_data;
    if (!transactionData?.qr_code) {
      return json({ error: "Mercado Pago não retornou um QR code Pix para esta cobrança." }, 502);
    }

    const { error: insertError } = await adminClient.from("payments").insert({
      appointment_id: appointmentId,
      status: "pending",
      method: "pix",
      amount: chargedAmount,
      platform_fee: feeAmount,
      provider: "mercadopago",
      provider_payment_id: String(payment.id),
      pix_qr_code: transactionData.qr_code,
      pix_qr_code_base64: transactionData.qr_code_base64 ?? null,
      pix_expires_at: payment.date_of_expiration ?? null,
    });

    if (insertError) return json({ error: insertError.message }, 500);

    return json({ qrCode: transactionData.qr_code, qrCodeBase64: transactionData.qr_code_base64 ?? null, expiresAt: payment.date_of_expiration ?? null });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Erro desconhecido." }, 500);
  }
});
