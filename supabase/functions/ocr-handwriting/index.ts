// Transcribes a photo of handwritten notes into plain text via Gemini's multimodal input (same
// model/secrets as ai-improve-text/ai-summarize-session, just with an inlineData image part
// instead of text-only). Same access check as ai-improve-text: stateless, not tied to one
// appointment, so "caller is a logged-in, non-suspended professional" is enough.
//
// Deploy: supabase functions deploy ocr-handwriting
// Secrets: reuses GEMINI_API_KEY / GEMINI_MODEL (already set for ai-summarize-session)
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
}

const PROMPT = "Transcreva fielmente o texto manuscrito nesta foto de uma anotação clínica em português. Não corrija, não resuma e não invente nada — só transcreva exatamente o que está escrito. Se algum trecho estiver ilegível, marque com [ilegível] no lugar.";

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    text: { type: "STRING" },
  },
  required: ["text"],
};

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header." }, 401);

    const { imageBase64, mimeType } = await req.json();
    if (typeof imageBase64 !== "string" || !imageBase64) return json({ error: "imageBase64 é obrigatório." }, 400);

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
          contents: [{ parts: [{ text: PROMPT }, { inlineData: { mimeType: mimeType || "image/jpeg", data: imageBase64 } }] }],
          generationConfig: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA },
        }),
      }
    );

    if (!geminiResponse.ok) {
      return json({ error: `Falha ao transcrever a imagem: ${await geminiResponse.text()}` }, 502);
    }

    const result = await geminiResponse.json();
    const rawText: string = result?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return json({ error: "Resposta da IA em formato inesperado." }, 502);
    }

    const text = typeof (parsed as any)?.text === "string" ? (parsed as any).text : "";
    if (!text) return json({ error: "IA não retornou nenhum texto transcrito." }, 502);

    return json({ text });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Erro desconhecido." }, 500);
  }
});
