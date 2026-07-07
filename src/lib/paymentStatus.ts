export type AppointmentPaymentStatus = "paid" | "pending" | "refunded" | "uncharged";

/** Pure classifier so it's unit-testable without a Supabase round-trip: given an appointment's
 *  most recent payment row's status (or none), what should the "Sessões" list show as payment
 *  status. Kept free of the `supabase` import (unlike payments.ts) — same split as
 *  conversations.ts/messages.ts. */
export function classifyPaymentStatus(latestPaymentStatus: string | null | undefined): AppointmentPaymentStatus {
  if (!latestPaymentStatus) return "uncharged";
  if (latestPaymentStatus === "paid") return "paid";
  if (latestPaymentStatus === "refunded") return "refunded";
  return "pending";
}
