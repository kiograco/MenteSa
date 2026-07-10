// Suggests talking points for a patient's next session by reading their recent SOAP notes +
// assessment scores and asking Gemini for an agenda — same Gemini/GEMINI_API_KEY setup as
// ai-summarize-session, but reads across several past sessions instead of one note the professional
// just typed, so the ownership check is patient-scoped (any appointment with this patient) rather
// than tied to a single appointment row.
//
// Deploy: supabase functions deploy ai-plan-session
// Secrets: reuses GEMINI_API_KEY / GEMINI_MODEL (already set for ai-summarize-session)
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
}

// Minimal Tiptap JSON -> plain text extractor, mirroring src/lib/richText.ts#tiptapJsonToPlainText
// — duplicated here rather than shared since this Edge Function runs on Deno and the frontend
// code isn't importable from it.
function docToPlainText(doc: any): string {
  if (!doc) return "";
  const collect = (node: any): string => (node.type === "text" ? node.text ?? "" : (node.content ?? []).map(collect).join(""));
  return (doc.content ?? []).map(collect).join("\n").trim();
}

function buildPrompt(notesText: string, assessmentsText: string): string {
  return `Você está ajudando um psicólogo(a) ou psiquiatra licenciado a se preparar para a próxima sessão com um paciente que já atende. Nenhum áudio foi gravado — o texto abaixo vem de notas SOAP que o próprio profissional escreveu em sessões anteriores, e de escalas que o paciente respondeu.

Com base nesse histórico, sugira pontos de pauta para a próxima sessão (temas a retomar, perguntas a fazer, sinais de alerta a observar) e uma breve nota de contexto. Não invente informações que não estejam no histórico.

Notas de sessões anteriores (mais recente primeiro):
<<<
${notesText || "(nenhuma nota registrada ainda)"}
>>>

Escalas respondidas recentemente:
<<<
${assessmentsText || "(nenhuma escala respondida ainda)"}
>>>`;
}

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    topics: { type: "ARRAY", items: { type: "STRING" } },
    notes: { type: "STRING" },
  },
  required: ["topics", "notes"],
};

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header." }, 401);

    const { patientId } = await req.json();
    if (!patientId) return json({ error: "patientId é obrigatório." }, 400);

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
      .select("suspended_at")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (callerProfile?.suspended_at) return json({ error: "Conta suspensa." }, 403);

    // Ownership: the caller must be the treating professional for this patient (some appointment
    // together) — session_notes has no direct FK to a patient, only via appointment_id.
    const { data: relationship } = await supabase
      .from("appointments")
      .select("id")
      .eq("patient_id", patientId)
      .eq("professional_id", userData.user.id)
      .limit(1)
      .maybeSingle();
    if (!relationship) return json({ error: "Acesso negado." }, 403);

    const { data: appointmentRows } = await supabase
      .from("appointments")
      .select("id, scheduled_at, session_notes(subjective, objective, assessment, plan)")
      .eq("patient_id", patientId)
      .eq("professional_id", userData.user.id)
      .order("scheduled_at", { ascending: false })
      .limit(5);

    const notesText = ((appointmentRows ?? []) as any[])
      .map(a => {
        const note = Array.isArray(a.session_notes) ? a.session_notes[0] : a.session_notes;
        if (!note) return "";
        const parts = [docToPlainText(note.subjective), docToPlainText(note.objective), docToPlainText(note.assessment), docToPlainText(note.plan)].filter(Boolean);
        if (!parts.length) return "";
        return `[${new Date(a.scheduled_at).toLocaleDateString("pt-BR")}]\n${parts.join("\n")}`;
      })
      .filter(Boolean)
      .join("\n\n");

    const { data: assessmentRows } = await supabase
      .from("assessment_responses")
      .select("total_score, severity, created_at, assessment_templates(name)")
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false })
      .limit(5);

    const assessmentsText = ((assessmentRows ?? []) as any[])
      .map(a => `${a.assessment_templates?.name ?? "Escala"}: ${a.total_score} pontos (${a.severity}) em ${new Date(a.created_at).toLocaleDateString("pt-BR")}`)
      .join("\n");

    const model = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "x-goog-api-key": apiKey, "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildPrompt(notesText, assessmentsText) }] }],
          generationConfig: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA },
        }),
      }
    );

    if (!geminiResponse.ok) {
      return json({ error: `Falha ao planejar a sessão: ${await geminiResponse.text()}` }, 502);
    }

    const result = await geminiResponse.json();
    const rawText: string = result?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return json({ error: "Resposta da IA em formato inesperado." }, 502);
    }

    const topics = Array.isArray((parsed as any)?.topics) ? (parsed as any).topics.map(String) : [];
    const notes = typeof (parsed as any)?.notes === "string" ? (parsed as any).notes : "";

    return json({ topics, notes });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Erro desconhecido." }, 500);
  }
});
