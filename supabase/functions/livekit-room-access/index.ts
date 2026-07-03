// Supabase Edge Function: issues a short-lived LiveKit access token for a participant of a paid
// appointment. LIVEKIT_API_SECRET never reaches the browser — only this function signs tokens.
// Unlike Daily.co, LiveKit doesn't need a separate "create room" call: the token's roomCreate
// grant lets the room server auto-create the room on first join.
//
// Deploy: supabase functions deploy livekit-room-access
// Secrets: supabase secrets set LIVEKIT_API_KEY=... LIVEKIT_API_SECRET=... LIVEKIT_URL=wss://your-project.livekit.cloud
import { createClient } from "npm:@supabase/supabase-js@2";
import { createLiveKitToken } from "../_shared/livekitToken.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header." }, 401);

    const { appointmentId } = await req.json();
    if (!appointmentId) return json({ error: "appointmentId is required." }, 400);

    const apiKey = Deno.env.get("LIVEKIT_API_KEY");
    const apiSecret = Deno.env.get("LIVEKIT_API_SECRET");
    const serverUrl = Deno.env.get("LIVEKIT_URL");
    if (!apiKey || !apiSecret || !serverUrl) {
      return json({ error: "LiveKit não configurado nos secrets da função." }, 500);
    }

    // Forwards the caller's own JWT so RLS decides whether they're actually a participant.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return json({ error: "Sessão inválida." }, 401);

    const { data: appointment, error: apptError } = await supabase
      .from("appointments")
      .select("id, patient_id, professional_id, profiles(full_name), professional_profiles(profiles(full_name))")
      .eq("id", appointmentId)
      .maybeSingle();

    if (apptError || !appointment) return json({ error: "Consulta não encontrada ou acesso negado." }, 404);

    // A real video room/token must never be handed out for an unpaid appointment — appointments
    // are created (status "scheduled") before the patient finishes checkout, so "the appointment
    // exists" alone is not proof of payment.
    const { data: payment } = await supabase
      .from("payments")
      .select("id")
      .eq("appointment_id", appointmentId)
      .eq("status", "paid")
      .maybeSingle();

    if (!payment) return json({ error: "Pagamento da consulta ainda não confirmado." }, 402);

    const item = appointment as any;
    const displayName = userData.user.id === item.patient_id
      ? item.profiles?.full_name ?? "Paciente"
      : item.professional_profiles?.profiles?.full_name ?? "Profissional";

    const roomName = `mindcare-${appointmentId}`;

    // Recorded for consistency with the rest of the schema (video_rooms already existed for the
    // previous provider) — not required for LiveKit to work, but keeps an audit trail per consulta.
    const { data: existingRoom } = await supabase
      .from("video_rooms")
      .select("id")
      .eq("appointment_id", appointmentId)
      .maybeSingle();

    if (!existingRoom) {
      await supabase.from("video_rooms").insert({
        appointment_id: appointmentId,
        room_url: serverUrl,
        provider_room_id: roomName,
      });
    }

    const token = await createLiveKitToken({
      apiKey,
      apiSecret,
      identity: userData.user.id,
      name: displayName,
      room: roomName,
      ttlSeconds: 60 * 60 * 4, // 4h, matches the appointment's expected max duration
    });

    return json({ serverUrl, token, roomName });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Erro desconhecido." }, 500);
  }
});
