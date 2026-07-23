// Shared by create-asaas-pix-charge (on-demand, triggered by a click in FinancialDashboard) and
// auto-charge-sessions (cron, triggered automatically N days before the session) — both need the
// exact same fee/QR-reuse/payments-insert logic, only the trigger differs. Callers are responsible
// for their own auth check before loading the appointment; this only needs the loaded row.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { asaasFetch, getOrCreateAsaasCustomer, todayIsoDate } from "./asaasClient.ts";

const PLATFORM_FEE_RATE = 0.1;

export type PixChargeResult =
  | { ok: true; qrCode: string; qrCodeBase64: string | null; expiresAt: string | null }
  | { ok: false; error: string; status: number };

export async function createPixChargeForAppointment(
  adminClient: SupabaseClient,
  appointment: { id: string; patient_id: string; professional_id: string; price: number }
): Promise<PixChargeResult> {
  const apiKey = Deno.env.get("ASAAS_API_KEY");
  if (!apiKey) return { ok: false, error: "ASAAS_API_KEY não configurado nos secrets da função.", status: 500 };

  // When the professional opts to pass the platform commission on to the patient, the surcharge
  // is added to what's actually charged via Pix; asaas-webhook (and the platform_fee below)
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
  // (avoids leaving a trail of abandoned Asaas payments per appointment).
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

  // Asaas requires a cpfCnpj to create the customer that gets charged — unlike Mercado Pago, which
  // only needed the payer's e-mail.
  const { data: patientRow } = await adminClient.from("patient_profiles").select("cpf").eq("id", appointment.patient_id).maybeSingle();
  if (!patientRow?.cpf) {
    return { ok: false, error: "O paciente precisa informar o CPF no cadastro antes de gerar uma cobrança Pix.", status: 422 };
  }

  const { data: patientAuth } = await adminClient.auth.admin.getUserById(appointment.patient_id);
  const payerEmail = patientAuth.user?.email;
  if (!payerEmail) return { ok: false, error: "Não foi possível identificar o e-mail do paciente para gerar a cobrança.", status: 422 };

  const { data: patientProfile } = await adminClient.from("profiles").select("full_name").eq("id", appointment.patient_id).maybeSingle();

  const customer = await getOrCreateAsaasCustomer(adminClient, "patient_profiles", appointment.patient_id, apiKey, {
    name: patientProfile?.full_name ?? "Paciente",
    email: payerEmail,
    cpfCnpj: patientRow.cpf,
  });
  if (!customer.ok) return { ok: false, error: customer.error, status: 502 };

  const paymentResponse = await asaasFetch("/payments", apiKey, {
    method: "POST",
    body: JSON.stringify({
      customer: customer.customerId,
      billingType: "PIX",
      value: chargedAmount,
      dueDate: todayIsoDate(),
      description: passFeeToPatient ? "Consulta — MindCare (inclui taxa da plataforma)" : "Consulta — MindCare",
      externalReference: appointment.id,
    }),
  });

  if (!paymentResponse.ok) {
    return { ok: false, error: `Falha ao criar cobrança Pix no Asaas: ${await paymentResponse.text()}`, status: 502 };
  }

  const payment = await paymentResponse.json();

  const qrResponse = await asaasFetch(`/payments/${payment.id}/pixQrCode`, apiKey);
  if (!qrResponse.ok) {
    return { ok: false, error: `Asaas não retornou um QR code Pix para esta cobrança: ${await qrResponse.text()}`, status: 502 };
  }
  const qr = await qrResponse.json();
  if (!qr.payload) {
    return { ok: false, error: "Asaas não retornou um QR code Pix para esta cobrança.", status: 502 };
  }

  const { error: insertError } = await adminClient.from("payments").insert({
    appointment_id: appointment.id,
    status: "pending",
    method: "pix",
    amount: chargedAmount,
    platform_fee: feeAmount,
    provider: "asaas",
    provider_payment_id: String(payment.id),
    pix_qr_code: qr.payload,
    pix_qr_code_base64: qr.encodedImage ?? null,
    pix_expires_at: qr.expirationDate ?? null,
  });

  if (insertError) return { ok: false, error: insertError.message, status: 500 };

  return { ok: true, qrCode: qr.payload, qrCodeBase64: qr.encodedImage ?? null, expiresAt: qr.expirationDate ?? null };
}
