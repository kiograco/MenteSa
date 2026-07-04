// Called by the client right after a cancellation succeeds. Notifies every patient waiting for
// that exact slot at once (see migration 20260703000014 for why this is deliberately simpler than
// a one-at-a-time hold/expiry system) — first to complete checkout wins, the unique index on
// appointments (20260703000011) makes that safe even under a race.
// Deploy: supabase functions deploy notify-waitlist-match
// Secrets: reuses RESEND_API_KEY / EMAIL_FROM already set for booking confirmations.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header." }, 401);

    const { professionalId, freedSlotIso } = await req.json();
    if (!professionalId || !freedSlotIso) return json({ error: "professionalId e freedSlotIso são obrigatórios." }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return json({ error: "Sessão inválida." }, 401);

    // Confirm a slot was actually freed by a real cancellation — not an arbitrary claim that
    // would spam waitlisted patients with fake "it's open" emails.
    const { data: cancelledAppointment } = await supabase
      .from("appointments")
      .select("id")
      .eq("professional_id", professionalId)
      .eq("scheduled_at", freedSlotIso)
      .eq("status", "cancelled")
      .maybeSingle();

    if (!cancelledAppointment) return json({ error: "Nenhum cancelamento correspondente encontrado." }, 404);

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) return json({ ok: true, skipped: "email not configured" });

    const adminClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: waitingEntries } = await adminClient
      .from("waitlist_entries")
      .select("id, patient_id")
      .eq("professional_id", professionalId)
      .eq("desired_scheduled_at", freedSlotIso)
      .eq("status", "waiting");

    if (!waitingEntries?.length) return json({ ok: true, notified: 0 });

    const { data: professional } = await adminClient
      .from("professional_profiles")
      .select("profiles(full_name)")
      .eq("id", professionalId)
      .maybeSingle();

    const professionalName = escapeHtml((professional as any)?.profiles?.full_name ?? "o profissional");
    const scheduledLabel = new Date(freedSlotIso).toLocaleString("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    });
    const fromEmail = Deno.env.get("EMAIL_FROM") ?? "MindCare <onboarding@resend.dev>";
    const siteUrl = Deno.env.get("SITE_URL") ?? "";
    const profileUrl = siteUrl ? `${siteUrl}/perfil/${professionalId}` : "";

    const emails = await Promise.all(
      waitingEntries.map(entry => adminClient.auth.admin.getUserById(entry.patient_id))
    );

    let notified = 0;
    await Promise.all(
      emails.map(({ data }) => {
        const email = data.user?.email;
        if (!email) return Promise.resolve();
        notified++;
        return fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendApiKey}`, "content-type": "application/json" },
          body: JSON.stringify({
            from: fromEmail,
            to: email,
            subject: "Um horário que você esperava abriu — MindCare",
            html: `
              <p>Olá!</p>
              <p>Um horário com <strong>${professionalName}</strong> que você estava esperando ficou livre: <strong>${scheduledLabel}</strong>.</p>
              <p>${profileUrl ? `Acesse <a href="${profileUrl}">${profileUrl}</a> pra agendar` : "Acesse o perfil do profissional no MindCare pra agendar"} — é por ordem de chegada, então quem confirmar primeiro garante a vaga.</p>
            `,
          }),
        }).catch(() => {});
      })
    );

    return json({ ok: true, notified });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Erro desconhecido." }, 500);
  }
});
