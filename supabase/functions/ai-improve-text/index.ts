// Rewrites/improves a piece of text the professional already wrote (a SOAP field, or the
// preview body of a Biblioteca de Modelos document) via Gemini — same "text only, never audio"
// posture as ai-summarize-session, and the same GEMINI_API_KEY secret. Unlike
// ai-summarize-session this isn't tied to one specific appointment — it's a stateless rewrite, so
// the only access check needed is "caller is a logged-in, non-suspended professional".
//
// Deploy: supabase functions deploy ai-improve-text
// Secrets: reuses GEMINI_API_KEY / GEMINI_MODEL (already set for ai-summarize-session)
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
}

function buildPrompt(text: string): string {
  return `Você está ajudando um psicólogo(a) ou psiquiatra licenciado a revisar um texto clínico que ele mesmo escreveu (nenhum áudio foi gravado). Melhore a clareza, a gramática e o tom profissional do texto abaixo, sem inventar informações novas nem mudar o sentido clínico do que foi escrito. Mantenha o texto em português, no mesmo idioma e registro (formal, terceira pessoa quando aplicável).

Texto original:
<<<
${text}
>>>`;
}

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    improvedText: { type: "STRING" },
  },
  required: ["improvedText"],
};

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header." }, 401);

    const { text } = await req.json();
    if (typeof text !== "string" || !text.trim()) return json({ error: "text é obrigatório." }, 400);

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return json({ error: "IA não configurada nos secrets da função." }, 500);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return json({ error: "Sessão inválida." }, 401);

    const { data: callerProfile } = await supabase
      .from("profiles")
      .select("role, suspended_at")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (callerProfile?.suspended_at) return json({ error: "Conta suspensa." }, 403);
    if (callerProfile?.role !== "professional") return json({ error: "Acesso negado." }, 403);

    const model = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "x-goog-api-key": apiKey, "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildPrompt(text) }] }],
          generationConfig: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA },
        }),
      }
    );

    if (!geminiResponse.ok) {
      return json({ error: `Falha ao melhorar o texto: ${await geminiResponse.text()}` }, 502);
    }

    const result = await geminiResponse.json();
    const rawText: string = result?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return json({ error: "Resposta da IA em formato inesperado." }, 502);
    }

    const improvedText = typeof (parsed as any)?.improvedText === "string" ? (parsed as any).improvedText : "";
    if (!improvedText) return json({ error: "IA não retornou um texto melhorado." }, 502);

    return json({ improvedText });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Erro desconhecido." }, 500);
  }
});
