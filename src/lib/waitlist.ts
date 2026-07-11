import { supabase } from "./supabase";
import { invokeEdgeFunction } from "./functionsClient";

export type WaitlistEntry = {
  id: string;
  professionalId: string;
  desiredScheduledAt: string;
  status: "waiting" | "claimed";
  createdAt: string;
};

export async function joinWaitlist(patientId: string, professionalId: string, desiredScheduledAtIso: string) {
  const { error } = await supabase.from("waitlist_entries").insert({
    patient_id: patientId,
    professional_id: professionalId,
    desired_scheduled_at: desiredScheduledAtIso,
  });
  if (error) throw error;
}

export async function leaveWaitlist(entryId: string) {
  const { error } = await supabase.from("waitlist_entries").delete().eq("id", entryId);
  if (error) throw error;
}

export async function listMyWaitlistEntries(patientId: string): Promise<WaitlistEntry[]> {
  const { data, error } = await supabase
    .from("waitlist_entries")
    .select("id, professional_id, desired_scheduled_at, status, created_at")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(d => ({
    id: d.id,
    professionalId: d.professional_id,
    desiredScheduledAt: d.desired_scheduled_at,
    status: d.status as "waiting" | "claimed",
    createdAt: d.created_at,
  }));
}

/** Best-effort: called right after a cancellation. Never throws — a failed notification should
 *  never surface as a failed cancellation. */
export async function notifyWaitlistMatch(professionalId: string, freedSlotIso: string): Promise<void> {
  await invokeEdgeFunction("notify-waitlist-match", { body: { professionalId, freedSlotIso } }).catch(() => {});
}
