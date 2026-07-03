import { supabase } from "./supabase";

export type LiveKitRoomAccess = { serverUrl: string; token: string; roomName: string };

/** Calls the livekit-room-access Edge Function. Returns null if LiveKit isn't configured
 *  (function not deployed, secrets missing, appointment unpaid, etc.) so callers can fall back
 *  to the mock room. */
export async function getLiveKitRoomAccess(appointmentId: string): Promise<LiveKitRoomAccess | null> {
  const { data, error } = await supabase.functions.invoke<{ serverUrl?: string; token?: string; roomName?: string; error?: string }>(
    "livekit-room-access",
    { body: { appointmentId } }
  );

  if (error || !data?.serverUrl || !data?.token || !data?.roomName) return null;
  return { serverUrl: data.serverUrl, token: data.token, roomName: data.roomName };
}
