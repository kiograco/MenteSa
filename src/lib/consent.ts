import { supabase } from "./supabase";

export async function hashDocumentText(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}

/** Whether the patient already signed this exact document version for this professional. */
export async function hasSignedConsent(patientId: string, professionalId: string, documentVersion: string): Promise<boolean> {
  const { data } = await supabase
    .from("consent_signatures")
    .select("id")
    .eq("patient_id", patientId)
    .eq("professional_id", professionalId)
    .eq("document_version", documentVersion)
    .maybeSingle();
  return Boolean(data);
}

/** Calls the sign-consent Edge Function, which captures IP/user-agent server-side (a client can't
 *  reliably self-report its own public IP) and writes the immutable signature record. */
export async function signConsent(professionalId: string, typedName: string, documentHash: string, documentVersion: string): Promise<boolean> {
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>("sign-consent", {
    body: { professionalId, typedName, documentHash, documentVersion },
  });
  return !error && Boolean(data?.ok);
}
