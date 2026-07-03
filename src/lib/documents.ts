import { supabase } from "./supabase";

const BUCKET = "professional-documents";

export type ProfessionalDocument = {
  id: string;
  fileName: string;
  storagePath: string;
  createdAt: string;
};

export async function uploadProfessionalDocument(professionalId: string, file: File) {
  const path = `${professionalId}/${Date.now()}-${file.name}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file);
  if (uploadError) throw uploadError;

  const { error: insertError } = await supabase.from("professional_documents").insert({
    professional_id: professionalId,
    storage_path: path,
    file_name: file.name,
  });
  if (insertError) throw insertError;
}

export async function listProfessionalDocuments(professionalId: string): Promise<ProfessionalDocument[]> {
  const { data, error } = await supabase
    .from("professional_documents")
    .select("id, file_name, storage_path, created_at")
    .eq("professional_id", professionalId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map(d => ({ id: d.id, fileName: d.file_name, storagePath: d.storage_path, createdAt: d.created_at }));
}

export async function getDocumentSignedUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 60);
  if (error) throw error;
  return data.signedUrl;
}
