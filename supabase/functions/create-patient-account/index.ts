// Lets a professional register a patient who isn't in the system yet: creates the auth account
// (fixed default password — the professional relays it to the patient, who can change it anytime
// via Configurações → Alterar senha) and books the first appointment in the same request. Both
// steps need the service role: account creation is an auth.admin operation, and the appointment
// insert has to bypass appointments_insert_professional_existing_patient (20260703000005), which
// requires the patient to already have an appointment with this professional — impossible for a
// brand new patient. This is the only path allowed to create that first appointment without one.
// Deploy: supabase functions deploy create-patient-account
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Fixed on purpose (not random) — the professional needs to be able to tell the patient the
// password without a side channel. Known tradeoff: anyone who knows this convention could log in
// to an account before the patient changes it, so the UI must make clear the patient should change
// it on first access.
const DEFAULT_PATIENT_PASSWORD = "MudarSenha@123";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header." }, 401);

    const { fullName, email, phone, scheduledAt, modality } = await req.json();
    if (!fullName?.trim() || !email?.trim() || !scheduledAt) {
      return json({ error: "Nome, e-mail e data/horário da primeira consulta são obrigatórios." }, 400);
    }
    if (new Date(scheduledAt).getTime() < Date.now()) {
      return json({ error: "Escolha uma data e horário no futuro pra primeira consulta." }, 400);
    }

    const callerClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData.user) return json({ error: "Sessão inválida." }, 401);

    const adminClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: callerProfile } = await adminClient.from("profiles").select("role").eq("id", userData.user.id).maybeSingle();
    if (callerProfile?.role !== "professional") return json({ error: "Acesso negado." }, 403);

    const { data: conflict } = await adminClient
      .from("appointments")
      .select("id")
      .eq("professional_id", userData.user.id)
      .eq("scheduled_at", scheduledAt)
      .eq("status", "scheduled")
      .maybeSingle();
    if (conflict) return json({ error: "Você já tem uma consulta marcada nesse horário." }, 409);

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email: email.trim(),
      password: DEFAULT_PATIENT_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: fullName.trim(), role: "patient" },
    });

    if (createError || !created.user) {
      const message = createError?.message?.includes("already been registered")
        ? "Este e-mail já está cadastrado."
        : createError?.message ?? "Não foi possível criar a conta.";
      return json({ error: message }, 400);
    }

    const patientId = created.user.id;

    if (phone?.trim()) {
      await adminClient.from("profiles").update({ phone: phone.trim() }).eq("id", patientId);
    }

    const { data: profRow } = await adminClient
      .from("professional_profiles")
      .select("session_price")
      .eq("id", userData.user.id)
      .maybeSingle();

    const { error: apptError } = await adminClient.from("appointments").insert({
      patient_id: patientId,
      professional_id: userData.user.id,
      scheduled_at: scheduledAt,
      modality: modality === "presencial" ? "presencial" : "online",
      price: Number(profRow?.session_price ?? 0),
    });

    if (apptError) {
      // Don't leave an orphaned login with no relationship to the professional who created it.
      await adminClient.auth.admin.deleteUser(patientId);
      return json({ error: "Não foi possível agendar a primeira consulta: " + apptError.message }, 500);
    }

    return json({ ok: true, patientId, defaultPassword: DEFAULT_PATIENT_PASSWORD });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Erro desconhecido." }, 500);
  }
});
