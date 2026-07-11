import { supabase } from "./supabase";

// Reuses the existing public "logos" bucket (same RLS: folder name must equal the uploader's own
// auth uid) instead of provisioning a new bucket just for cover images — same storage-path-prefix
// pattern as src/lib/logo.ts, just a different filename prefix and column.
const BUCKET = "logos";

/** Uploads a new profile cover image and points professional_profiles.cover_url at it. */
export async function uploadCoverImage(professionalId: string, file: File): Promise<string> {
  const path = `${professionalId}/cover-${Date.now()}-${file.name}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file);
  if (uploadError) throw uploadError;

  const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(path);

  const { error: updateError } = await supabase
    .from("professional_profiles")
    .update({ cover_url: publicUrlData.publicUrl })
    .eq("id", professionalId);
  if (updateError) throw updateError;

  return publicUrlData.publicUrl;
}
