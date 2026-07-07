import { supabase } from "./supabase";

const BUCKET = "patient-documents";

export type PatientDocument = {
  id: string;
  fileName: string;
  storagePath: string;
  uploadedBy: string;
  createdAt: string;
};

export async function uploadPatientDocument(patientId: string, uploadedBy: string, file: File) {
  const path = `${patientId}/${Date.now()}-${file.name}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file);
  if (uploadError) throw uploadError;

  const { error: insertError } = await supabase.from("patient_documents").insert({
    patient_id: patientId,
    uploaded_by: uploadedBy,
    storage_path: path,
    file_name: file.name,
  });
  if (insertError) throw insertError;
}

export async function listPatientDocuments(patientId: string): Promise<PatientDocument[]> {
  const { data, error } = await supabase
    .from("patient_documents")
    .select("id, file_name, storage_path, uploaded_by, created_at")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map(d => ({ id: d.id, fileName: d.file_name, storagePath: d.storage_path, uploadedBy: d.uploaded_by, createdAt: d.created_at }));
}

export async function deletePatientDocument(id: string, storagePath: string) {
  await supabase.storage.from(BUCKET).remove([storagePath]);
  const { error } = await supabase.from("patient_documents").delete().eq("id", id);
  if (error) throw error;
}

export async function getPatientDocumentSignedUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 60);
  if (error) throw error;
  return data.signedUrl;
}
