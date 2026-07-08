// Public endpoint (no Supabase session) that a patient hits by clicking the confirmation link sent
// via WhatsApp (send-appointment-reminder). Confirming attendance shouldn't require logging in, so
// this is gated purely by knowing the per-appointment confirmation_token (a separate secret from
// account auth) rather than any RLS policy — the client (ConfirmAttendanceScreen) never talks to
// the appointments table directly for this.
// Deploy: supabase functions deploy confirm-attendance --no-verify-jwt
// (--no-verify-jwt is required: the patient clicking a WhatsApp link has no Supabase session)
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
    const { token } = await req.json();
    if (typeof token !== "string" || !token) return json({ error: "Token inválido." }, 400);

    const adminClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: appointment, error: fetchError } = await adminClient
      .from("appointments")
      .select("id, scheduled_at, status, confirmed_at, profiles(full_name), professional_profiles(profiles(full_name))")
      .eq("confirmation_token", token)
      .maybeSingle();

    if (fetchError || !appointment) return json({ error: "Consulta não encontrada." }, 404);
    if (appointment.status !== "scheduled") return json({ error: "Esta consulta não está mais agendada." }, 409);

    if (!appointment.confirmed_at) {
      const { error: updateError } = await adminClient
        .from("appointments")
        .update({ confirmed_at: new Date().toISOString() })
        .eq("id", appointment.id);
      if (updateError) return json({ error: updateError.message }, 500);
    }

    return json({
      ok: true,
      patientName: (appointment as any).profiles?.full_name ?? "",
      professionalName: (appointment as any).professional_profiles?.profiles?.full_name ?? "",
      scheduledAt: appointment.scheduled_at,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Erro desconhecido." }, 500);
  }
});
