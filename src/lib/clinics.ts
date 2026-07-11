import { supabase } from "./supabase";
import { extractFunctionErrorMessage, invokeEdgeFunction } from "./functionsClient";

export type StaffMember = { id: string; userId: string; fullName: string };
export type ClinicProfessional = { id: string; fullName: string };

/** Calls create-staff-account: invites a secretária (native Supabase invite e-mail, same pattern
 *  as createPatientAccount) and lazily creates the professional's clinic on first use. */
export async function inviteStaffMember(fullName: string, email: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await invokeEdgeFunction<{ ok?: boolean }>("create-staff-account", { body: { fullName, email } });
  if (error || !data?.ok) {
    return { ok: false, error: (await extractFunctionErrorMessage(error)) ?? "Não foi possível convidar a secretária." };
  }
  return { ok: true };
}

/** Lists the staff linked to a clinic this professional owns — empty if they've never invited
 *  anyone (no clinic row exists yet). */
export async function listMyStaff(professionalId: string): Promise<StaffMember[]> {
  const { data: clinic } = await supabase.from("clinics").select("id").eq("owner_professional_id", professionalId).maybeSingle();
  if (!clinic) return [];

  const { data, error } = await supabase
    .from("clinic_staff")
    .select("id, user_id, profiles(full_name)")
    .eq("clinic_id", clinic.id)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as any[]).map(d => ({ id: d.id, userId: d.user_id, fullName: d.profiles?.full_name ?? "Secretária" }));
}

export async function removeStaffMember(clinicStaffId: string): Promise<void> {
  const { error } = await supabase.from("clinic_staff").delete().eq("id", clinicStaffId);
  if (error) throw error;
}

/** For a staff login: which professionals (in their one clinic) can they act for. */
export async function listMyProfessionals(userId: string): Promise<ClinicProfessional[]> {
  const { data: membership } = await supabase.from("clinic_staff").select("clinic_id").eq("user_id", userId).maybeSingle();
  if (!membership) return [];

  const { data, error } = await supabase
    .from("professional_profiles")
    .select("id, profiles(full_name)")
    .eq("clinic_id", membership.clinic_id);
  if (error) throw error;
  return ((data ?? []) as any[]).map(d => ({ id: d.id, fullName: d.profiles?.full_name ?? "Profissional" }));
}

/** Calls create-clinic-professional: invites another licensed psychologist to a Pessoa Jurídica's
 *  clinic — a full professional account (own agenda/patients/prontuário), not a secretária, only
 *  grouped under the clinic for branding + shared billing. */
export async function inviteClinicProfessional(
  fullName: string,
  email: string,
  licenseType: string,
  licenseNumber: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await invokeEdgeFunction<{ ok?: boolean }>("create-clinic-professional", {
    body: { fullName, email, licenseType, licenseNumber },
  });
  if (error || !data?.ok) {
    return { ok: false, error: (await extractFunctionErrorMessage(error)) ?? "Não foi possível convidar o psicólogo." };
  }
  return { ok: true };
}

/** Other professionals registered under the same clinic (Pessoa Jurídica) as `professionalId` —
 *  excludes the owner themselves, since this is for the "quem mais atende na clínica" list. */
export async function listClinicProfessionals(professionalId: string): Promise<ClinicProfessional[]> {
  const { data: clinic } = await supabase.from("clinics").select("id").eq("owner_professional_id", professionalId).maybeSingle();
  if (!clinic) return [];

  const { data, error } = await supabase
    .from("professional_profiles")
    .select("id, profiles(full_name)")
    .eq("clinic_id", clinic.id)
    .neq("id", professionalId);
  if (error) throw error;
  return ((data ?? []) as any[]).map(d => ({ id: d.id, fullName: d.profiles?.full_name ?? "Profissional" }));
}
