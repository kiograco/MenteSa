export const SESSION_ENTRY_LEAD_TIME_MS = 5 * 60 * 1000;

export function canEnterSession(scheduledAt: string, nowMs = Date.now()): boolean {
  const scheduledAtMs = new Date(scheduledAt).getTime();
  return Number.isFinite(scheduledAtMs) && nowMs >= scheduledAtMs - SESSION_ENTRY_LEAD_TIME_MS;
}
