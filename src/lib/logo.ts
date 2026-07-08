import { supabase } from "./supabase";

const BUCKET = "logos";

/** Uploads a new professional logo and points professional_profiles.logo_url at it. Returns the
 *  public URL. Mirrors src/lib/avatar.ts exactly (same public-bucket-plus-path-prefix pattern) —
 *  the old file, if any, is left in place, same tradeoff already accepted for avatars. */
export async function uploadLogo(professionalId: string, file: File): Promise<string> {
  const path = `${professionalId}/${Date.now()}-${file.name}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file);
  if (uploadError) throw uploadError;

  const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(path);

  const { error: updateError } = await supabase
    .from("professional_profiles")
    .update({ logo_url: publicUrlData.publicUrl })
    .eq("id", professionalId);
  if (updateError) throw updateError;

  return publicUrlData.publicUrl;
}
