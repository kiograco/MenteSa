// Lets a Pessoa Jurídica professional (a clinic) invite another licensed psychologist to
// "act within the clinic's profile" — unlike create-staff-account (secretária, fixed
// Agenda+Pacientes-only scope via clinic_staff), this creates a REAL professional account with its
// own CRP/CRM, own agenda, own patients and own prontuário (clinical confidentiality stays 1:1
// between a professional and their own patients, same strict rule as everywhere else in this app)
// — it's only grouped under the clinic's professional_profiles.clinic_id for public-profile
// branding and, per the business decision confirmed with the user, billing: one subscription per
// clinic covers every professional registered under it, so the invited professional never needs a
// plan of their own (see getSubscriptionAccess in src/lib/subscriptions.ts).
// Deploy: supabase functions deploy create-clinic-professional
// Secrets: reuses APP_BASE_URL (already set for create-patient-account/create-staff-account)
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

    const { fullName, email, licenseType, licenseNumber } = await req.json();
    if (!fullName?.trim() || !email?.trim() || !licenseNumber?.trim()) {
      return json({ error: "Nome, e-mail e CRP/CRM são obrigatórios." }, 400);
    }

    const callerClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData.user) return json({ error: "Sessão inválida." }, 401);

    const adminClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: callerProfile } = await adminClient
      .from("professional_profiles")
      .select("person_type, clinic_id, profiles(full_name)")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (!callerProfile) return json({ error: "Acesso negado." }, 403);
    if (callerProfile.person_type !== "juridica") {
      return json({ error: "Só cadastros de Pessoa Jurídica podem registrar outros psicólogos na clínica." }, 403);
    }

    let clinicId = callerProfile.clinic_id;

    if (!clinicId) {
      const ownerName = (callerProfile as any).profiles?.full_name ?? "Profissional";
      const { data: newClinic, error: clinicError } = await adminClient
        .from("clinics")
        .insert({ name: `Clínica de ${ownerName}`, owner_professional_id: userData.user.id })
        .select("id")
        .single();
      if (clinicError || !newClinic) return json({ error: clinicError?.message ?? "Não foi possível criar a clínica." }, 500);

      clinicId = newClinic.id;
      await adminClient.from("professional_profiles").update({ clinic_id: clinicId }).eq("id", userData.user.id);
    }

    const appBaseUrl = Deno.env.get("APP_BASE_URL");
    const { data: created, error: createError } = await adminClient.auth.admin.inviteUserByEmail(email.trim(), {
      data: {
        full_name: fullName.trim(),
        role: "professional",
        license_type: licenseType?.toUpperCase().includes("CRM") ? "CRM" : "CRP",
        license_number: licenseNumber.trim(),
      },
      redirectTo: appBaseUrl ? `${appBaseUrl}/definir-senha` : undefined,
    });

    if (createError || !created.user) {
      const message = createError?.message?.includes("already been registered")
        ? "Este e-mail já está cadastrado."
        : createError?.message ?? "Não foi possível convidar o psicólogo.";
      return json({ error: message }, 400);
    }

    // handle_new_user() already created professional_profiles for this new user (role:
    // "professional" in the metadata above) — this just links it into the clinic.
    const { error: linkError } = await adminClient.from("professional_profiles").update({ clinic_id: clinicId }).eq("id", created.user.id);

    if (linkError) {
      // Don't leave an orphaned login with no relationship to the clinic that created it.
      await adminClient.auth.admin.deleteUser(created.user.id);
      return json({ error: "Não foi possível vincular o psicólogo à clínica: " + linkError.message }, 500);
    }

    return json({ ok: true, userId: created.user.id });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Erro desconhecido." }, 500);
  }
});
