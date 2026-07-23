// Daily sweep (invoked by the pg_cron job added in migration 20260717000004) that generates a Pix
// charge automatically for professionals who opted in (professional_profiles.auto_charge_enabled),
// N days before each scheduled session (auto_charge_days_before). Reuses the exact same
// fee/QR-reuse/payments-insert logic as the on-demand "Cobrar via Pix" button
// (create-asaas-pix-charge) via _shared/pixCharge.ts. No retry: an appointment that already has a
// pending or paid payment is skipped outright, so this only ever fires once per appointment.
// Deploy: supabase functions deploy auto-charge-sessions --no-verify-jwt
// (--no-verify-jwt is required: pg_cron/pg_net calls this without a Supabase auth token, only the
// x-cron-secret header checked below)
// Secrets: supabase secrets set CRON_SECRET=... ASAAS_API_KEY=...
import { createClient } from "npm:@supabase/supabase-js@2";
import { createPixChargeForAppointment } from "../_shared/pixCharge.ts";

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

    const { data: professionals, error: profError } = await adminClient
      .from("professional_profiles")
      .select("id, auto_charge_days_before")
      .eq("auto_charge_enabled", true);

    if (profError) return json({ error: profError.message }, 500);
    if (!professionals?.length) return json({ ok: true, charged: 0 });

    let charged = 0;

    for (const prof of professionals as any[]) {
      const daysBefore = Number(prof.auto_charge_days_before ?? 1);
      const windowStart = new Date();
      windowStart.setHours(0, 0, 0, 0);
      windowStart.setDate(windowStart.getDate() + daysBefore);
      const windowEnd = new Date(windowStart);
      windowEnd.setDate(windowEnd.getDate() + 1);

      const { data: appointments } = await adminClient
        .from("appointments")
        .select("id, patient_id, professional_id, price")
        .eq("professional_id", prof.id)
        .eq("status", "scheduled")
        .gte("scheduled_at", windowStart.toISOString())
        .lt("scheduled_at", windowEnd.toISOString());

      for (const appt of (appointments ?? []) as any[]) {
        const { data: existingPayment } = await adminClient
          .from("payments")
          .select("id")
          .eq("appointment_id", appt.id)
          .in("status", ["pending", "paid"])
          .limit(1)
          .maybeSingle();
        if (existingPayment) continue;

        const result = await createPixChargeForAppointment(adminClient, appt);
        if (result.ok) charged += 1;
      }
    }

    return json({ ok: true, charged });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Erro desconhecido." }, 500);
  }
});
