import { extractFunctionErrorMessage, invokeEdgeFunction } from "./functionsClient";

export type CreatePatientAccountResult =
  | { ok: true; patientId: string }
  | { ok: false; error: string };

/** Calls create-patient-account: invites a patient who isn't in the system yet (native Supabase
 *  invite e-mail — the patient sets their own password) and books their first appointment with the
 *  calling professional in the same request — that appointment is what makes the new patient
 *  visible everywhere else in the app (patient list, EHR, messages), since those all derive "my
 *  patients" from appointment history rather than a separate roster. */
export async function createPatientAccount(params: {
  fullName: string;
  email: string;
  phone?: string;
  scheduledAt: string;
  modality: "online" | "presencial";
  price?: number;
}): Promise<CreatePatientAccountResult> {
  const { data, error } = await invokeEdgeFunction<{ ok?: boolean; patientId?: string }>(
    "create-patient-account",
    { body: params }
  );

  if (error || !data?.ok || !data.patientId) {
    return { ok: false, error: (await extractFunctionErrorMessage(error)) ?? "Não foi possível cadastrar o paciente." };
  }

  return { ok: true, patientId: data.patientId };
}
