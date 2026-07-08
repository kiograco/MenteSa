import { supabase } from "./supabase";

export type ConfirmAttendanceResult =
  | { ok: true; patientName: string; professionalName: string; scheduledAt: string }
  | { ok: false; error: string };

/** Calls the public confirm-attendance Edge Function — no Supabase session involved, the token
 *  itself (from the WhatsApp link) is the only credential. */
export async function confirmAttendance(token: string): Promise<ConfirmAttendanceResult> {
  const { data, error } = await supabase.functions.invoke<{
    ok?: boolean; patientName?: string; professionalName?: string; scheduledAt?: string; error?: string;
  }>("confirm-attendance", { body: { token } });

  if (error || !data?.ok) {
    return { ok: false, error: data?.error ?? "Não foi possível confirmar a presença. O link pode ter expirado." };
  }

  return { ok: true, patientName: data.patientName ?? "", professionalName: data.professionalName ?? "", scheduledAt: data.scheduledAt ?? "" };
}
