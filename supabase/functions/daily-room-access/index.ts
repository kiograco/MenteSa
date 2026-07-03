// Supabase Edge Function: creates (or reuses) a private Daily.co room for an appointment and
// issues a short-lived meeting token for the calling participant. DAILY_API_KEY never reaches
// the browser — only this function talks to Daily's API.
//
// Deploy: supabase functions deploy daily-room-access
// Secret:  supabase secrets set DAILY_API_KEY=...
import { createClient } from "npm:@supabase/supabase-js@2";

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

    const dailyApiKey = Deno.env.get("DAILY_API_KEY");
    if (!dailyApiKey) return json({ error: "DAILY_API_KEY não configurada nos secrets da função." }, 500);

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

    const item = appointment as any;
    const displayName = userData.user.id === item.patient_id
      ? item.profiles?.full_name ?? "Paciente"
      : item.professional_profiles?.profiles?.full_name ?? "Profissional";

    const { data: existingRoom } = await supabase
      .from("video_rooms")
      .select("room_url, provider_room_id")
      .eq("appointment_id", appointmentId)
      .maybeSingle();

    let roomUrl = existingRoom?.room_url;
    let roomName = existingRoom?.provider_room_id;

    if (!roomUrl) {
      const roomResponse = await fetch("https://api.daily.co/v1/rooms", {
        method: "POST",
        headers: { Authorization: `Bearer ${dailyApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `mindcare-${appointmentId}`,
          privacy: "private",
          properties: {
            exp: Math.floor(Date.now() / 1000) + 60 * 60 * 4, // room usable for 4h
            enable_chat: true,
            enable_screenshare: true,
          },
        }),
      });

      if (!roomResponse.ok) {
        return json({ error: `Falha ao criar sala no Daily.co: ${await roomResponse.text()}` }, 502);
      }

      const room = await roomResponse.json();
      roomUrl = room.url;
      roomName = room.name;

      const { error: insertError } = await supabase.from("video_rooms").insert({
        appointment_id: appointmentId,
        room_url: roomUrl,
        provider_room_id: roomName,
      });
      if (insertError) return json({ error: insertError.message }, 500);
    }

    const tokenResponse = await fetch("https://api.daily.co/v1/meeting-tokens", {
      method: "POST",
      headers: { Authorization: `Bearer ${dailyApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        properties: {
          room_name: roomName,
          user_name: displayName,
          exp: Math.floor(Date.now() / 1000) + 60 * 60 * 4,
        },
      }),
    });

    if (!tokenResponse.ok) {
      return json({ error: `Falha ao gerar token de acesso: ${await tokenResponse.text()}` }, 502);
    }

    const { token } = await tokenResponse.json();

    return json({ roomUrl, token });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Erro desconhecido." }, 500);
  }
});
