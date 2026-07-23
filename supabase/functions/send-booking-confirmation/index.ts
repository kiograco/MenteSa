// Called by the client right after a successful mock-flow payment (the Asaas path sends
// its own confirmation from asaas-webhook instead, since that's the authoritative moment).
// Deploy: supabase functions deploy send-booking-confirmation
// Secrets: supabase secrets set RESEND_API_KEY=... EMAIL_FROM="MindCare <no-reply@yourdomain.com>"
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendBookingConfirmationEmail } from "../_shared/email.ts";

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

    const { data: appointment } = await callerClient
      .from("appointments")
      .select("id, patient_id")
      .eq("id", appointmentId)
      .maybeSingle();

    if (!appointment || appointment.patient_id !== userData.user.id) {
      return json({ error: "Acesso negado." }, 403);
    }

    const adminClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    await sendBookingConfirmationEmail(adminClient, appointmentId);

    return json({ ok: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Erro desconhecido." }, 500);
  }
});
