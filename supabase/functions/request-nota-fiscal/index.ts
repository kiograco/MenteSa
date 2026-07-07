// Requests nota fiscal issuance for a paid session. No provider (eNotas/Focus NFe/etc.) is wired
// up yet — until NOTA_FISCAL_PROVIDER/NOTA_FISCAL_API_KEY are configured, this always records (and
// returns) an "unavailable" result with a clear message, so the "Emitir nota fiscal" button in the
// Financeiro dashboard always has something sensible to show instead of silently failing. Plugging
// in a real provider later only means adding the actual API call here — the request/response shape
// and the generated_documents/nota_fiscal_requests schema are already in place.
//
// Deploy: supabase functions deploy request-nota-fiscal
// Secrets (optional, not yet used by any real provider): NOTA_FISCAL_PROVIDER, NOTA_FISCAL_API_KEY
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

    const { paymentId } = await req.json();
    if (!paymentId) return json({ error: "paymentId is required." }, 400);

    const callerClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData.user) return json({ error: "Sessão inválida." }, 401);

    const { data: payment, error: paymentError } = await callerClient
      .from("payments")
      .select("id, status, appointments!inner(professional_id)")
      .eq("id", paymentId)
      .maybeSingle();

    if (paymentError || !payment) return json({ error: "Pagamento não encontrado ou acesso negado." }, 404);
    if ((payment as any).appointments?.professional_id !== userData.user.id) {
      return json({ error: "Apenas o profissional da consulta pode solicitar a nota fiscal." }, 403);
    }
    if (payment.status !== "paid") return json({ error: "Só é possível emitir nota fiscal de um pagamento confirmado." }, 409);

    const provider = Deno.env.get("NOTA_FISCAL_PROVIDER");
    const apiKey = Deno.env.get("NOTA_FISCAL_API_KEY");

    const adminClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // No provider configured: record and return the "unavailable" state — expected today, not an error.
    if (!provider || !apiKey) {
      const message = "Emissão de nota fiscal ainda não está disponível nesta conta — em breve.";
      const { error: insertError } = await adminClient.from("nota_fiscal_requests").insert({
        payment_id: paymentId,
        status: "unavailable",
        message,
      });
      if (insertError) return json({ error: insertError.message }, 500);
      return json({ status: "unavailable", message });
    }

    // Placeholder for when a real provider is wired up — intentionally not implemented yet.
    return json({ status: "unavailable", message: "Provedor de nota fiscal configurado, mas a integração ainda não foi implementada." });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Erro desconhecido." }, 500);
  }
});
