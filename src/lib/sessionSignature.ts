import { supabase } from "./supabase";

/** Calls the sign-session-note Edge Function to digitally sign a SOAP note. Mirrors signConsent
 *  (src/lib/consent.ts): the client never writes signed_at/typed_name/signature_hash directly,
 *  only the service-role Edge Function does, so the signature record can be trusted. */
export async function signSessionNote(appointmentId: string, typedName: string, documentHash: string): Promise<boolean> {
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>("sign-session-note", {
    body: { appointmentId, typedName, documentHash },
  });
  return !error && Boolean(data?.ok);
}
