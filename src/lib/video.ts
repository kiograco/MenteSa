import { extractFunctionErrorMessage, invokeEdgeFunction } from "./functionsClient";

export type LiveKitRoomAccess = { serverUrl: string; token: string; roomName: string };
export type LiveKitRoomAccessResult =
  | { ok: true; access: LiveKitRoomAccess }
  | { ok: false; reason: string };

/** Calls the livekit-room-access Edge Function. Returns { ok: false } if LiveKit isn't configured
 *  (function not deployed, secrets missing, appointment unpaid, etc.) so callers can fall back
 *  to the mock room — `reason` is surfaced in the UI so "why is this the mock room?" has an answer
 *  instead of silently degrading. */
export async function getLiveKitRoomAccess(appointmentId: string): Promise<LiveKitRoomAccessResult> {
  const { data, error } = await invokeEdgeFunction<{ serverUrl?: string; token?: string; roomName?: string; error?: string }>(
    "livekit-room-access",
    { body: { appointmentId } }
  );

  if (error || !data?.serverUrl || !data?.token || !data?.roomName) {
    const reason = (await extractFunctionErrorMessage(error)) ?? data?.error ?? "Vídeo real indisponível.";
    return { ok: false, reason };
  }

  return { ok: true, access: { serverUrl: data.serverUrl, token: data.token, roomName: data.roomName } };
}
