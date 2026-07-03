import { supabase } from "./supabase";

export type DailyRoomAccess = { roomUrl: string; token: string };

/** Calls the daily-room-access Edge Function. Returns null if Daily.co isn't configured
 *  (function not deployed, DAILY_API_KEY missing, etc.) so callers can fall back to the mock room. */
export async function getDailyRoomAccess(appointmentId: string): Promise<DailyRoomAccess | null> {
  const { data, error } = await supabase.functions.invoke<{ roomUrl?: string; token?: string; error?: string }>(
    "daily-room-access",
    { body: { appointmentId } }
  );

  if (error || !data?.roomUrl || !data?.token) return null;
  return { roomUrl: data.roomUrl, token: data.token };
}
