// Lets a professional invite a staff member (secretária) who can act on their behalf within a
// fixed, limited scope (Agenda + Pacientes — RLS never grants staff access to Financeiro or the
// clinical content of the Prontuário, see migration 20260719000002). Lazily creates a `clinics`
// row the first time a professional invites staff (most professionals never touch this — no
// upfront "create your clinic" step needed). Same invite-by-email pattern as
// create-patient-account: the staff member sets their own password, no shared default password.
// Deploy: supabase functions deploy create-staff-account
// Secrets: reuses APP_BASE_URL (already set for create-patient-account/send-appointment-reminder)
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header." }, 401);

    const { fullName, email } = await req.json();
    if (!fullName?.trim() || !email?.trim()) {
      return json({ error: "Nome e e-mail são obrigatórios." }, 400);
    }

    const callerClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData.user) return json({ error: "Sessão inválida." }, 401);

    const adminClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: callerProfile } = await adminClient.from("profiles").select("role, full_name").eq("id", userData.user.id).maybeSingle();
    if (callerProfile?.role !== "professional") return json({ error: "Acesso negado." }, 403);

    const { data: existingProClinic } = await adminClient
      .from("professional_profiles")
      .select("clinic_id")
      .eq("id", userData.user.id)
      .maybeSingle();

    let clinicId = existingProClinic?.clinic_id ?? null;

    if (!clinicId) {
      const { data: newClinic, error: clinicError } = await adminClient
        .from("clinics")
        .insert({ name: `Consultório de ${callerProfile.full_name}`, owner_professional_id: userData.user.id })
        .select("id")
        .single();
      if (clinicError || !newClinic) return json({ error: clinicError?.message ?? "Não foi possível criar a clínica." }, 500);

      clinicId = newClinic.id;
      await adminClient.from("professional_profiles").update({ clinic_id: clinicId }).eq("id", userData.user.id);
    }

    const appBaseUrl = Deno.env.get("APP_BASE_URL");
    const { data: created, error: createError } = await adminClient.auth.admin.inviteUserByEmail(email.trim(), {
      data: { full_name: fullName.trim(), role: "staff" },
      redirectTo: appBaseUrl ? `${appBaseUrl}/definir-senha` : undefined,
    });

    if (createError || !created.user) {
      const message = createError?.message?.includes("already been registered")
        ? "Este e-mail já está cadastrado."
        : createError?.message ?? "Não foi possível convidar a secretária.";
      return json({ error: message }, 400);
    }

    const { error: staffError } = await adminClient.from("clinic_staff").insert({ clinic_id: clinicId, user_id: created.user.id });

    if (staffError) {
      // Don't leave an orphaned login with no relationship to the clinic that created it.
      await adminClient.auth.admin.deleteUser(created.user.id);
      return json({ error: "Não foi possível vincular a secretária à clínica: " + staffError.message }, 500);
    }

    return json({ ok: true, userId: created.user.id });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Erro desconhecido." }, 500);
  }
});
