export type AppointmentForMetrics = { status: string; patientId: string };

/** Share of past (completed or cancelled) appointments that were actually completed.
 *  Note: there's no distinct "no-show" status in this app yet — a patient who simply didn't show
 *  up is indistinguishable from a properly cancelled appointment, so this mixes the two. */
export function calculateAttendanceRate(appointments: AppointmentForMetrics[]): number {
  const past = appointments.filter(a => a.status === "completed" || a.status === "cancelled");
  if (past.length === 0) return 0;
  return past.filter(a => a.status === "completed").length / past.length;
}

/** Share of past appointments that were cancelled (the complement of attendance rate). */
export function calculateCancellationRate(appointments: AppointmentForMetrics[]): number {
  const past = appointments.filter(a => a.status === "completed" || a.status === "cancelled");
  if (past.length === 0) return 0;
  return past.filter(a => a.status === "cancelled").length / past.length;
}

/** Share of distinct patients who have booked more than one appointment with this professional. */
export function calculateRetentionRate(appointments: AppointmentForMetrics[]): number {
  const counts = new Map<string, number>();
  for (const a of appointments) counts.set(a.patientId, (counts.get(a.patientId) ?? 0) + 1);
  if (counts.size === 0) return 0;
  const returning = Array.from(counts.values()).filter(c => c >= 2).length;
  return returning / counts.size;
}
