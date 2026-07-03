// Shared by send-booking-confirmation (client-invoked, best-effort after the mock charge) and
// mercadopago-webhook (server-invoked, right after a real payment is confirmed). Both call this
// with a service-role client since it needs auth.admin.getUserById to read the patient's e-mail
// (profiles has no email column — that lives on auth.users).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

// profiles.full_name is user-controlled (anyone can sign up as "professional" with any name) and
// gets embedded in this HTML e-mail, so it must be escaped — otherwise a malicious display name
// becomes stored HTML injection served from MindCare's own confirmation e-mails.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendBookingConfirmationEmail(supabaseAdmin: SupabaseClient, appointmentId: string): Promise<void> {
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) return; // Not configured — silently skip, this is a nice-to-have, not a booking blocker.

  const { data: appt, error } = await supabaseAdmin
    .from("appointments")
    .select("patient_id, scheduled_at, price, profiles(full_name), professional_profiles(profiles(full_name))")
    .eq("id", appointmentId)
    .maybeSingle();

  if (error || !appt) return;

  const item = appt as any;
  const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(item.patient_id);
  if (userError || !userData.user?.email) return;

  const patientName = escapeHtml(item.profiles?.full_name ?? "Paciente");
  const professionalName = escapeHtml(item.professional_profiles?.profiles?.full_name ?? "seu profissional");
  const scheduledLabel = new Date(item.scheduled_at).toLocaleString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
  const fromEmail = Deno.env.get("EMAIL_FROM") ?? "MindCare <onboarding@resend.dev>";

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: fromEmail,
      to: userData.user.email,
      subject: "Consulta confirmada — MindCare",
      html: `
        <p>Olá, ${patientName}!</p>
        <p>Sua consulta com <strong>${professionalName}</strong> está confirmada para <strong>${scheduledLabel}</strong>.</p>
        <p>Valor: R$${Number(item.price).toFixed(2).replace(".", ",")}</p>
        <p>Acompanhe os detalhes e acesse a sala de vídeo pelo seu painel no MindCare.</p>
      `,
    }),
  }).catch(() => {
    // Best-effort: a failed confirmation e-mail should never surface as a failed booking/payment.
  });
}
