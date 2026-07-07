// Periodic sweep (invoked every 15 min by the pg_cron job added in migration
// 20260707000005) that WhatsApp-reminds patients about appointments starting in ~24h. Unlike
// send-booking-confirmation, this is never called by the client — only by the cron job — so it's
// gated by a shared secret instead of a user session, and uses the service-role client throughout.
// Deploy: supabase functions deploy send-appointment-reminder --no-verify-jwt
// (--no-verify-jwt is required: pg_cron/pg_net calls this without a Supabase auth token, only the
// x-cron-secret header checked above)
// Secrets: supabase secrets set CRON_SECRET=... WHATSAPP_PHONE_NUMBER_ID=... WHATSAPP_ACCESS_TOKEN=... WHATSAPP_TEMPLATE_NAME=...
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendAppointmentReminderWhatsApp } from "../_shared/whatsapp.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async req => {
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) {
    return json({ error: "Não autorizado." }, 401);
  }

  try {
    const adminClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Wide 2h window so this still catches every appointment even if a run is skipped/delayed —
    // whatsapp_reminder_sent_at guarantees each one is only ever messaged once.
    const windowStart = new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString();
    const windowEnd = new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString();

    const { data: appointments, error } = await adminClient
      .from("appointments")
      .select("id, scheduled_at, patient_id, profiles(full_name, phone), professional_profiles(profiles(full_name))")
      .eq("status", "scheduled")
      .is("whatsapp_reminder_sent_at", null)
      .gte("scheduled_at", windowStart)
      .lte("scheduled_at", windowEnd);

    if (error) return json({ error: error.message }, 500);
    if (!appointments?.length) return json({ ok: true, sent: 0 });

    let sent = 0;
    for (const appt of appointments as any[]) {
      const phone: string | null = appt.profiles?.phone ?? null;
      if (!phone) continue;

      const { data: patientProfile } = await adminClient
        .from("patient_profiles")
        .select("whatsapp_reminders_enabled")
        .eq("id", appt.patient_id)
        .maybeSingle();
      if (patientProfile && patientProfile.whatsapp_reminders_enabled === false) continue;

      const scheduledLabel = new Date(appt.scheduled_at).toLocaleString("pt-BR", {
        weekday: "long", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit",
      });
      const patientName = appt.profiles?.full_name ?? "Paciente";
      const professionalName = appt.professional_profiles?.profiles?.full_name ?? "seu profissional";

      const ok = await sendAppointmentReminderWhatsApp(phone, patientName, professionalName, scheduledLabel);
      if (ok) {
        await adminClient.from("appointments").update({ whatsapp_reminder_sent_at: new Date().toISOString() }).eq("id", appt.id);
        sent += 1;
      }
    }

    return json({ ok: true, sent });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Erro desconhecido." }, 500);
  }
});
