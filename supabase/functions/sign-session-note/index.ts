// Digitally signs a SOAP session note. Only this function ever writes signed_at/typed_name/
// signature_hash (the client never writes those columns directly) so the "assinado por" record is
// trustworthy, and the session_notes_prevent_edit_after_sign trigger (migration
// 20260707000002) then makes the signed clinical text immutable at the database level, even for
// this function's own service-role client.
// Deploy: supabase functions deploy sign-session-note
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

    const { appointmentId, typedName, documentHash } = await req.json();
    if (!appointmentId || typeof typedName !== "string" || !typedName.trim() || !documentHash) {
      return json({ error: "Campos obrigatórios ausentes." }, 400);
    }

    const callerClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData.user) return json({ error: "Sessão inválida." }, 401);

    const { data: note } = await callerClient
      .from("session_notes")
      .select("id, professional_id, signed_at")
      .eq("appointment_id", appointmentId)
      .maybeSingle();

    if (!note || note.professional_id !== userData.user.id) return json({ error: "Acesso negado." }, 403);
    if (note.signed_at) return json({ error: "Esta nota já foi assinada." }, 409);

    const adminClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { error: updateError } = await adminClient
      .from("session_notes")
      .update({ signed_at: new Date().toISOString(), typed_name: typedName.trim(), signature_hash: documentHash })
      .eq("appointment_id", appointmentId);

    if (updateError) return json({ error: updateError.message }, 500);

    return json({ ok: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Erro desconhecido." }, 500);
  }
});
