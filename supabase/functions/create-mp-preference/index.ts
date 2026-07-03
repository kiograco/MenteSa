// Supabase Edge Function: creates a Mercado Pago Checkout Pro preference for an appointment
// and returns the hosted checkout URL. The client redirects the patient there — card data never
// touches our app, and MERCADOPAGO_ACCESS_TOKEN never reaches the browser.
//
// Deploy: supabase functions deploy create-mp-preference
// Secrets: supabase secrets set MERCADOPAGO_ACCESS_TOKEN=... APP_BASE_URL=https://your-app.example
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

    const { appointmentId } = await req.json();
    if (!appointmentId) return json({ error: "appointmentId is required." }, 400);

    const accessToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
    if (!accessToken) return json({ error: "MERCADOPAGO_ACCESS_TOKEN não configurado nos secrets da função." }, 500);

    const appBaseUrl = Deno.env.get("APP_BASE_URL") ?? "";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return json({ error: "Sessão inválida." }, 401);

    // RLS (appointments_select_participants) already restricts this to the appointment's own
    // patient/professional/admin — if the row comes back, the caller is allowed to pay for it.
    const { data: appointment, error: apptError } = await supabase
      .from("appointments")
      .select("id, patient_id, price, professional_profiles(profiles(full_name))")
      .eq("id", appointmentId)
      .maybeSingle();

    if (apptError || !appointment) return json({ error: "Consulta não encontrada ou acesso negado." }, 404);
    if (appointment.patient_id !== userData.user.id) {
      return json({ error: "Apenas o paciente da consulta pode pagar por ela." }, 403);
    }

    const professionalName = (appointment as any).professional_profiles?.profiles?.full_name ?? "profissional";

    const preferenceResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [
          {
            title: `Consulta com ${professionalName} — MindCare`,
            quantity: 1,
            currency_id: "BRL",
            unit_price: Number(appointment.price),
          },
        ],
        external_reference: appointmentId,
        back_urls: {
          success: `${appBaseUrl}/?mp=success`,
          pending: `${appBaseUrl}/?mp=pending`,
          failure: `${appBaseUrl}/?mp=failure`,
        },
        auto_return: "approved",
        notification_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/mercadopago-webhook`,
      }),
    });

    if (!preferenceResponse.ok) {
      return json({ error: `Falha ao criar preferência no Mercado Pago: ${await preferenceResponse.text()}` }, 502);
    }

    const preference = await preferenceResponse.json();
    return json({ initPoint: preference.init_point });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Erro desconhecido." }, 500);
  }
});
