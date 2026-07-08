// Shared by create-pix-charge (on-demand, triggered by a click in FinancialDashboard) and
// auto-charge-sessions (cron, triggered automatically N days before the session) — both need the
// exact same fee/QR-reuse/payments-insert logic, only the trigger differs. Callers are responsible
// for their own auth check before loading the appointment; this only needs the loaded row.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

const PLATFORM_FEE_RATE = 0.1;

export type PixChargeResult =
  | { ok: true; qrCode: string; qrCodeBase64: string | null; expiresAt: string | null }
  | { ok: false; error: string; status: number };

export async function createPixChargeForAppointment(
  adminClient: SupabaseClient,
  appointment: { id: string; patient_id: string; professional_id: string; price: number }
): Promise<PixChargeResult> {
  const accessToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
  if (!accessToken) return { ok: false, error: "MERCADOPAGO_ACCESS_TOKEN não configurado nos secrets da função.", status: 500 };

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
  // (avoids leaving a trail of abandoned MP payments per appointment).
  const { data: existing } = await adminClient
    .from("payments")
    .select("status, pix_qr_code, pix_qr_code_base64, pix_expires_at")
    .eq("appointment_id", appointment.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.status === "paid") return { ok: false, error: "Esta consulta já está paga.", status: 409 };
  if (existing?.status === "pending" && existing.pix_qr_code && existing.pix_expires_at && new Date(existing.pix_expires_at) > new Date()) {
    return { ok: true, qrCode: existing.pix_qr_code, qrCodeBase64: existing.pix_qr_code_base64, expiresAt: existing.pix_expires_at };
  }

  const { data: patientAuth } = await adminClient.auth.admin.getUserById(appointment.patient_id);
  const payerEmail = patientAuth.user?.email;
  if (!payerEmail) return { ok: false, error: "Não foi possível identificar o e-mail do paciente para gerar a cobrança.", status: 422 };

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
      external_reference: appointment.id,
      payer: { email: payerEmail },
    }),
  });

  if (!paymentResponse.ok) {
    return { ok: false, error: `Falha ao criar cobrança Pix no Mercado Pago: ${await paymentResponse.text()}`, status: 502 };
  }

  const payment = await paymentResponse.json();
  const transactionData = payment.point_of_interaction?.transaction_data;
  if (!transactionData?.qr_code) {
    return { ok: false, error: "Mercado Pago não retornou um QR code Pix para esta cobrança.", status: 502 };
  }

  const { error: insertError } = await adminClient.from("payments").insert({
    appointment_id: appointment.id,
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

  if (insertError) return { ok: false, error: insertError.message, status: 500 };

  return { ok: true, qrCode: transactionData.qr_code, qrCodeBase64: transactionData.qr_code_base64 ?? null, expiresAt: payment.date_of_expiration ?? null };
}
