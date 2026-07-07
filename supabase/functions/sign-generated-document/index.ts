// Digitally signs a generated document (declaração, relatório, parecer, laudo, encaminhamento).
// Same trust model as sign-session-note/sign-consent: only this function ever writes
// signed_at/typed_name/signature_hash, so the client can't fabricate a signature record.
// Deploy: supabase functions deploy sign-generated-document
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

    const { documentId, typedName, documentHash } = await req.json();
    if (!documentId || typeof typedName !== "string" || !typedName.trim() || !documentHash) {
      return json({ error: "Campos obrigatórios ausentes." }, 400);
    }

    const callerClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData.user) return json({ error: "Sessão inválida." }, 401);

    const { data: document } = await callerClient
      .from("generated_documents")
      .select("id, professional_id, signed_at")
      .eq("id", documentId)
      .maybeSingle();

    if (!document || document.professional_id !== userData.user.id) return json({ error: "Acesso negado." }, 403);
    if (document.signed_at) return json({ error: "Este documento já foi assinado." }, 409);

    const adminClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { error: updateError } = await adminClient
      .from("generated_documents")
      .update({ signed_at: new Date().toISOString(), typed_name: typedName.trim(), signature_hash: documentHash })
      .eq("id", documentId);

    if (updateError) return json({ error: updateError.message }, 500);

    return json({ ok: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Erro desconhecido." }, 500);
  }
});
