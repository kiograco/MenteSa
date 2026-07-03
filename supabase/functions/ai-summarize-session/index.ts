// Turns a professional's typed session notes into a structured AI summary (key points, action
// items, a polished clinical note) via the Anthropic API. No audio is ever recorded or sent —
// only text the professional already typed themselves. ANTHROPIC_API_KEY never reaches the
// browser; only this function talks to Anthropic.
//
// Deploy: supabase functions deploy ai-summarize-session
// Secrets: supabase secrets set ANTHROPIC_API_KEY=... (optional: ANTHROPIC_MODEL=claude-...)
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
}

function buildPrompt(notes: string): string {
  return `Você está ajudando um psicólogo(a) ou psiquiatra licenciado a organizar as notas que ele mesmo digitou sobre uma sessão clínica. Nenhum áudio foi gravado — o texto abaixo foi escrito pelo profissional.

A partir das notas, produza APENAS um objeto JSON (sem markdown, sem crases, sem texto antes ou depois) com exatamente estas chaves:
- "keyPoints": array de strings curtas com os pontos-chave clínicos observados
- "actionItems": array de strings curtas com ações/tarefas combinadas para o paciente ou plano de acompanhamento
- "clinicalNote": uma única string em português, um parágrafo de nota clínica objetiva e profissional, adequada para o prontuário

Se as notas forem muito curtas para extrair algo, ainda assim devolva o JSON com os melhores campos possíveis (arrays vazios se não houver nada aplicável).

Notas do profissional:
<<<
${notes}
>>>`;
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header." }, 401);

    const { appointmentId, notes } = await req.json();
    if (!appointmentId || typeof notes !== "string" || !notes.trim()) {
      return json({ error: "appointmentId e notes são obrigatórios." }, 400);
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "IA não configurada nos secrets da função." }, 500);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return json({ error: "Sessão inválida." }, 401);

    const { data: appointment, error: apptError } = await supabase
      .from("appointments")
      .select("id, professional_id")
      .eq("id", appointmentId)
      .maybeSingle();

    if (apptError || !appointment) return json({ error: "Consulta não encontrada ou acesso negado." }, 404);

    // appointments_select_participants (RLS) lets EITHER the patient or the professional read
    // this row — this feature is professional-only, so an explicit ownership check is required
    // here (unlike livekit-room-access, which intentionally allows either participant).
    if (appointment.professional_id !== userData.user.id) return json({ error: "Acesso negado." }, 403);

    const model = Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-5";

    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1500,
        messages: [{ role: "user", content: buildPrompt(notes) }],
      }),
    });

    if (!anthropicResponse.ok) {
      return json({ error: `Falha ao gerar resumo: ${await anthropicResponse.text()}` }, 502);
    }

    const result = await anthropicResponse.json();
    const rawText: string = result?.content?.[0]?.text ?? "";
    // Claude may still wrap the JSON in markdown fences despite instructions — strip defensively.
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return json({ error: "Resposta da IA em formato inesperado." }, 502);
    }

    const keyPoints = Array.isArray((parsed as any)?.keyPoints) ? (parsed as any).keyPoints.map(String) : [];
    const actionItems = Array.isArray((parsed as any)?.actionItems) ? (parsed as any).actionItems.map(String) : [];
    const clinicalNote = typeof (parsed as any)?.clinicalNote === "string" ? (parsed as any).clinicalNote : "";

    return json({ keyPoints, actionItems, clinicalNote });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Erro desconhecido." }, 500);
  }
});
