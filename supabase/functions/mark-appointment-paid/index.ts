// Lets a professional record a payment that happened outside the platform (cash, bank transfer,
// something arranged before charging via the app) — without this, an appointment that was never
// paid through Asaas/Pix can never reach "paid" status, which also silently blocks real
// video (livekit-room-access requires a paid payment before issuing a room token). This writes via
// service role rather than an RLS insert policy for the professional, same trust boundary as
// asaas-webhook: platform_fee is money owed to the platform, so it's computed here (from the
// appointment's base price, same PLATFORM_FEE_RATE as every other payment path) rather than trusting
// whatever the client sends.
// Deploy: supabase functions deploy mark-appointment-paid
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

    const callerClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData.user) return json({ error: "Sessão inválida." }, 401);

    // RLS (appointments_select_participants) already restricts this to the appointment's own
    // patient/professional/admin — the explicit professional_id check below is what actually
    // matters (a patient marking their own session "paid" would be meaningless).
    const { data: appointment, error: apptError } = await callerClient
      .from("appointments")
      .select("id, professional_id, price")
      .eq("id", appointmentId)
      .maybeSingle();

    if (apptError || !appointment) return json({ error: "Consulta não encontrada ou acesso negado." }, 404);
    if (appointment.professional_id !== userData.user.id) {
      return json({ error: "Apenas o profissional da consulta pode marcar como pago." }, 403);
    }

    const adminClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: existing } = await adminClient
      .from("payments")
      .select("status")
      .eq("appointment_id", appointmentId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.status === "paid") return json({ error: "Esta consulta já está paga." }, 409);

    const basePrice = Number(appointment.price);
    const feeAmount = Number((basePrice * PLATFORM_FEE_RATE).toFixed(2));
    const now = new Date().toISOString();

    const { error: insertError } = await adminClient.from("payments").insert({
      appointment_id: appointmentId,
      status: "paid",
      method: "manual",
      amount: basePrice,
      platform_fee: feeAmount,
      provider: "manual",
      paid_at: now,
    });

    if (insertError) return json({ error: insertError.message }, 500);

    return json({ ok: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Erro desconhecido." }, 500);
  }
});
