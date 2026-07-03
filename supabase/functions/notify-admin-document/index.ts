// Called by the client right after a professional uploads a verification document, so admins
// don't have to remember to check the dashboard. Best-effort: a failed notification must never
// block the upload itself (the client fires this without awaiting/blocking the UI on its result).
// Deploy: supabase functions deploy notify-admin-document
// Secrets: reuses RESEND_API_KEY / EMAIL_FROM already set for send-booking-confirmation.
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

    const { professionalId, fileName } = await req.json();
    if (!professionalId || !fileName) return json({ error: "professionalId and fileName are required." }, 400);

    const callerClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData.user || userData.user.id !== professionalId) {
      return json({ error: "Acesso negado." }, 403);
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) return json({ ok: true, skipped: "email not configured" });

    const adminClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const [{ data: professional }, { data: admins }] = await Promise.all([
      adminClient
        .from("professional_profiles")
        .select("license_type, license_number, profiles(full_name)")
        .eq("id", professionalId)
        .maybeSingle(),
      adminClient.from("profiles").select("id").eq("role", "admin"),
    ]);

    if (!admins?.length) return json({ ok: true, skipped: "no admin accounts" });

    const professionalName = escapeHtml((professional as any)?.profiles?.full_name ?? "Um profissional");
    const license = escapeHtml(`${(professional as any)?.license_type ?? "CRP"} ${(professional as any)?.license_number ?? ""}`.trim());
    const fromEmail = Deno.env.get("EMAIL_FROM") ?? "MindCare <onboarding@resend.dev>";
    const siteUrl = Deno.env.get("SITE_URL") ?? "";

    const adminEmails = (
      await Promise.all(admins.map(a => adminClient.auth.admin.getUserById(a.id)))
    )
      .map(r => r.data.user?.email)
      .filter((email): email is string => !!email);

    await Promise.all(
      adminEmails.map(email =>
        fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: fromEmail,
            to: email,
            subject: "Novo documento para verificação — MindCare",
            html: `
              <p>Olá!</p>
              <p><strong>${professionalName}</strong> (${license}) enviou um novo documento (<em>${escapeHtml(fileName)}</em>) para análise de registro profissional.</p>
              <p>Acesse o painel administrativo para revisar${siteUrl ? ` em <a href="${siteUrl}/admin">${siteUrl}/admin</a>` : ""}.</p>
            `,
          }),
        }).catch(() => {})
      )
    );

    return json({ ok: true, notified: adminEmails.length });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Erro desconhecido." }, 500);
  }
});
