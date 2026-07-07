export type AppointmentForMetrics = { status: string; patientId: string };

const PAST_STATUSES = ["completed", "cancelled", "no_show"];

/** Share of past (completed, cancelled or no-show) appointments that were actually completed. */
export function calculateAttendanceRate(appointments: AppointmentForMetrics[]): number {
  const past = appointments.filter(a => PAST_STATUSES.includes(a.status));
  if (past.length === 0) return 0;
  return past.filter(a => a.status === "completed").length / past.length;
}

/** Share of past appointments that were cancelled by either party (ahead of time). */
export function calculateCancellationRate(appointments: AppointmentForMetrics[]): number {
  const past = appointments.filter(a => PAST_STATUSES.includes(a.status));
  if (past.length === 0) return 0;
  return past.filter(a => a.status === "cancelled").length / past.length;
}

/** Share of past appointments where the patient simply didn't show up. */
export function calculateNoShowRate(appointments: AppointmentForMetrics[]): number {
  const past = appointments.filter(a => PAST_STATUSES.includes(a.status));
  if (past.length === 0) return 0;
  return past.filter(a => a.status === "no_show").length / past.length;
}

/** Share of distinct patients who have booked more than one appointment with this professional. */
export function calculateRetentionRate(appointments: AppointmentForMetrics[]): number {
  const counts = new Map<string, number>();
  for (const a of appointments) counts.set(a.patientId, (counts.get(a.patientId) ?? 0) + 1);
  if (counts.size === 0) return 0;
  const returning = Array.from(counts.values()).filter(c => c >= 2).length;
  return returning / counts.size;
}
