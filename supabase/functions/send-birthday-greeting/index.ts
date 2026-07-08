// Daily sweep (invoked once a day by the pg_cron job added in migration
// 20260716000006) that WhatsApp-greets patients on their birthday. Same shared-secret gate and
// service-role posture as send-appointment-reminder — never called by the client, only by cron.
// Deploy: supabase functions deploy send-birthday-greeting --no-verify-jwt
// (--no-verify-jwt is required: pg_cron/pg_net calls this without a Supabase auth token, only the
// x-cron-secret header checked below)
// Secrets: supabase secrets set CRON_SECRET=... WHATSAPP_PHONE_NUMBER_ID=... WHATSAPP_ACCESS_TOKEN=... WHATSAPP_BIRTHDAY_TEMPLATE_NAME=...
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendBirthdayGreetingWhatsApp } from "../_shared/whatsapp.ts";

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

    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const year = now.getFullYear();

    // patient_profiles has no direct date-part filter in postgrest, so this pulls every patient
    // with a birth_date set and filters month/day in JS — fine at this app's scale, and avoids a
    // raw SQL function just for this one job.
    const { data: candidates, error } = await adminClient
      .from("patient_profiles")
      .select("id, birth_date, whatsapp_reminders_enabled, last_birthday_greeted_year, profiles(full_name, phone)")
      .not("birth_date", "is", null)
      .eq("whatsapp_reminders_enabled", true);

    if (error) return json({ error: error.message }, 500);
    if (!candidates?.length) return json({ ok: true, sent: 0 });

    let sent = 0;
    for (const candidate of candidates as any[]) {
      if (candidate.last_birthday_greeted_year === year) continue;

      const birthDate = new Date(candidate.birth_date);
      if (birthDate.getUTCMonth() + 1 !== month || birthDate.getUTCDate() !== day) continue;

      const phone: string | null = candidate.profiles?.phone ?? null;
      if (!phone) continue;

      const { data: recentAppointment } = await adminClient
        .from("appointments")
        .select("professional_profiles(profiles(full_name))")
        .eq("patient_id", candidate.id)
        .order("scheduled_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const patientName = candidate.profiles?.full_name ?? "";
      const professionalName = (recentAppointment as any)?.professional_profiles?.profiles?.full_name ?? "sua equipe de cuidado";

      const ok = await sendBirthdayGreetingWhatsApp(phone, patientName, professionalName);
      if (ok) {
        await adminClient.from("patient_profiles").update({ last_birthday_greeted_year: year }).eq("id", candidate.id);
        sent += 1;
      }
    }

    return json({ ok: true, sent });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Erro desconhecido." }, 500);
  }
});
