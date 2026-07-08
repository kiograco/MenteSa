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
import { createPixChargeForAppointment } from "../_shared/pixCharge.ts";

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

    const { appointmentId } = await req.json();
    if (!appointmentId) return json({ error: "appointmentId is required." }, 400);

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

    const result = await createPixChargeForAppointment(adminClient, appointment);
    if (!result.ok) return json({ error: result.error }, result.status);

    return json({ qrCode: result.qrCode, qrCodeBase64: result.qrCodeBase64, expiresAt: result.expiresAt });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Erro desconhecido." }, 500);
  }
});
