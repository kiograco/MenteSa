// Records an e-signed informed consent. Only this function ever writes to consent_signatures
// (no client-facing insert policy) specifically so ip_address/user_agent can never be spoofed by
// the client — reading the real caller IP reliably requires the server-side x-forwarded-for
// header, which client-side JS has no way to self-report.
// Deploy: supabase functions deploy sign-consent
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

    const { professionalId, typedName, documentHash, documentVersion } = await req.json();
    if (!professionalId || typeof typedName !== "string" || !typedName.trim() || !documentHash || !documentVersion) {
      return json({ error: "Campos obrigatórios ausentes." }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return json({ error: "Sessão inválida." }, 401);

    const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const userAgent = req.headers.get("user-agent");

    const adminClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { error: insertError } = await adminClient.from("consent_signatures").insert({
      patient_id: userData.user.id,
      professional_id: professionalId,
      document_version: documentVersion,
      document_hash: documentHash,
      typed_name: typedName.trim(),
      ip_address: ipAddress,
      user_agent: userAgent,
    });

    if (insertError) return json({ error: insertError.message }, 500);

    return json({ ok: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Erro desconhecido." }, 500);
  }
});
