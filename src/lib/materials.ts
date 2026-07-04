import { supabase } from "./supabase";

const BUCKET = "shared-materials";

export type PatientMaterial = {
  id: string;
  fileName: string;
  storagePath: string;
  patientId: string | null;
  createdAt: string;
};

/** `patientId` null = shared with every patient of this professional. */
export async function uploadPatientMaterial(professionalId: string, file: File, patientId: string | null) {
  const path = `${professionalId}/${Date.now()}-${file.name}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file);
  if (uploadError) throw uploadError;

  const { error: insertError } = await supabase.from("patient_materials").insert({
    professional_id: professionalId,
    patient_id: patientId,
    storage_path: path,
    file_name: file.name,
  });
  if (insertError) throw insertError;
}

export async function listMaterialsForProfessional(professionalId: string): Promise<PatientMaterial[]> {
  const { data, error } = await supabase
    .from("patient_materials")
    .select("id, file_name, storage_path, patient_id, created_at")
    .eq("professional_id", professionalId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(d => ({ id: d.id, fileName: d.file_name, storagePath: d.storage_path, patientId: d.patient_id, createdAt: d.created_at }));
}

export async function listMaterialsForPatient(patientId: string): Promise<PatientMaterial[]> {
  const { data, error } = await supabase
    .from("patient_materials")
    .select("id, file_name, storage_path, patient_id, created_at")
    .or(`patient_id.eq.${patientId},patient_id.is.null`)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(d => ({ id: d.id, fileName: d.file_name, storagePath: d.storage_path, patientId: d.patient_id, createdAt: d.created_at }));
}

export async function deletePatientMaterial(id: string, storagePath: string) {
  await supabase.storage.from(BUCKET).remove([storagePath]);
  const { error } = await supabase.from("patient_materials").delete().eq("id", id);
  if (error) throw error;
}

export async function getMaterialSignedUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 60);
  if (error) throw error;
  return data.signedUrl;
}

export type PatientTask = {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
};

export async function assignTask(professionalId: string, patientId: string, title: string, description: string, dueDate: string | null) {
  const { error } = await supabase.from("patient_tasks").insert({
    professional_id: professionalId,
    patient_id: patientId,
    title,
    description: description || null,
    due_date: dueDate,
  });
  if (error) throw error;
}

export async function listTasksForPatient(patientId: string): Promise<PatientTask[]> {
  const { data, error } = await supabase
    .from("patient_tasks")
    .select("id, title, description, due_date, completed_at, created_at")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(d => ({ id: d.id, title: d.title, description: d.description, dueDate: d.due_date, completedAt: d.completed_at, createdAt: d.created_at }));
}

export async function listTasksForProfessional(professionalId: string): Promise<(PatientTask & { patientId: string })[]> {
  const { data, error } = await supabase
    .from("patient_tasks")
    .select("id, title, description, due_date, completed_at, created_at, patient_id")
    .eq("professional_id", professionalId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(d => ({ id: d.id, title: d.title, description: d.description, dueDate: d.due_date, completedAt: d.completed_at, createdAt: d.created_at, patientId: d.patient_id }));
}

export async function markTaskCompleted(taskId: string, completed: boolean) {
  const { error } = await supabase.from("patient_tasks").update({ completed_at: completed ? new Date().toISOString() : null }).eq("id", taskId);
  if (error) throw error;
}
