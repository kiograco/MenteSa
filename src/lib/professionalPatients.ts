import { supabase } from "./supabase";
import { extractFunctionErrorMessage } from "./functionsClient";

export type CreatePatientAccountResult =
  | { ok: true; patientId: string; defaultPassword: string }
  | { ok: false; error: string };

/** Calls create-patient-account: registers a patient who isn't in the system yet (fixed default
 *  password, login = email) and books their first appointment with the calling professional in the
 *  same request — that appointment is what makes the new patient visible everywhere else in the
 *  app (patient list, EHR, messages), since those all derive "my patients" from appointment
 *  history rather than a separate roster. */
export async function createPatientAccount(params: {
  fullName: string;
  email: string;
  phone?: string;
  scheduledAt: string;
  modality: "online" | "presencial";
}): Promise<CreatePatientAccountResult> {
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; patientId?: string; defaultPassword?: string }>(
    "create-patient-account",
    { body: params }
  );

  if (error || !data?.ok || !data.patientId || !data.defaultPassword) {
    return { ok: false, error: (await extractFunctionErrorMessage(error)) ?? "Não foi possível cadastrar o paciente." };
  }

  return { ok: true, patientId: data.patientId, defaultPassword: data.defaultPassword };
}
