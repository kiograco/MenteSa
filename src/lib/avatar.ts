import { supabase } from "./supabase";

const BUCKET = "avatars";

/** Uploads a new profile photo and points profiles.avatar_url at it. Returns the public URL.
 *  The old file (if any) is left in place — harmless orphaned storage, same tradeoff already made
 *  for professional_documents (no cleanup-on-replace there either). */
export async function uploadAvatar(userId: string, file: File): Promise<string> {
  const path = `${userId}/${Date.now()}-${file.name}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file);
  if (uploadError) throw uploadError;

  const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(path);

  const { error: updateError } = await supabase.from("profiles").update({ avatar_url: publicUrlData.publicUrl }).eq("id", userId);
  if (updateError) throw updateError;

  return publicUrlData.publicUrl;
}
