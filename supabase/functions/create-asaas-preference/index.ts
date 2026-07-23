// Supabase Edge Function: creates an Asaas charge for an appointment and returns the hosted
// invoice URL. The client redirects the patient there — card/Pix/boleto data never touches our
// app, and ASAAS_API_KEY never reaches the browser. billingType "UNDEFINED" lets the patient pick
// Pix/boleto/card on Asaas's own page (closest equivalent to Mercado Pago's Checkout Pro).
//
// Deploy: supabase functions deploy create-asaas-preference
// Secrets: supabase secrets set ASAAS_API_KEY=... APP_BASE_URL=https://your-app.example
import { createClient } from "npm:@supabase/supabase-js@2";
import { asaasFetch, getOrCreateAsaasCustomer, todayIsoDate } from "../_shared/asaasClient.ts";

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

    // RLS (appointments_select_participants) already restricts this to the appointment's own
    // patient/professional/admin — if the row comes back, the caller is allowed to pay for it.
    const { data: appointment, error: apptError } = await callerClient
      .from("appointments")
      .select("id, patient_id, price, professional_profiles(pass_fee_to_patient, profiles(full_name))")
      .eq("id", appointmentId)
      .maybeSingle();

    if (apptError || !appointment) return json({ error: "Consulta não encontrada ou acesso negado." }, 404);
    if (appointment.patient_id !== userData.user.id) {
      return json({ error: "Apenas o paciente da consulta pode pagar por ela." }, 403);
    }

    const adminClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Asaas requires a cpfCnpj to create the customer that gets charged.
    const { data: patientRow } = await adminClient.from("patient_profiles").select("cpf").eq("id", userData.user.id).maybeSingle();
    if (!patientRow?.cpf) return json({ error: "Informe seu CPF no cadastro antes de pagar por essa consulta." }, 422);

    const professionalName = (appointment as any).professional_profiles?.profiles?.full_name ?? "profissional";
    // When the professional opts to pass the platform commission on to the patient, the surcharge
    // is added here (what Asaas actually charges); asaas-webhook computes payments.platform_fee
    // from the appointment's base price, not from this charged total, so what the professional
    // nets is the same either way — only who pays the commission changes.
    const passFeeToPatient = Boolean((appointment as any).professional_profiles?.pass_fee_to_patient);
    const basePrice = Number(appointment.price);
    const chargedAmount = passFeeToPatient ? Number((basePrice * (1 + PLATFORM_FEE_RATE)).toFixed(2)) : basePrice;

    const { data: patientProfile } = await adminClient.from("profiles").select("full_name").eq("id", userData.user.id).maybeSingle();
    const customer = await getOrCreateAsaasCustomer(adminClient, "patient_profiles", userData.user.id, apiKey, {
      name: patientProfile?.full_name ?? "Paciente",
      email: userData.user.email ?? "",
      cpfCnpj: patientRow.cpf,
    });
    if (!customer.ok) return json({ error: customer.error }, 502);

    const paymentResponse = await asaasFetch("/payments", apiKey, {
      method: "POST",
      body: JSON.stringify({
        customer: customer.customerId,
        billingType: "UNDEFINED",
        value: chargedAmount,
        dueDate: todayIsoDate(),
        description: passFeeToPatient
          ? `Consulta com ${professionalName} — MindCare (inclui taxa da plataforma)`
          : `Consulta com ${professionalName} — MindCare`,
        externalReference: appointmentId,
        callback: { successUrl: `${appBaseUrl}/?asaas=success`, autoRedirect: true },
      }),
    });

    if (!paymentResponse.ok) {
      return json({ error: `Falha ao criar cobrança no Asaas: ${await paymentResponse.text()}` }, 502);
    }

    const payment = await paymentResponse.json();
    return json({ checkoutUrl: payment.invoiceUrl });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Erro desconhecido." }, 500);
  }
});
