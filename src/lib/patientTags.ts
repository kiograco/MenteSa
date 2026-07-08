import { supabase } from "./supabase";

/** Fixed palette instead of a free color picker — keeps the tag list visually consistent and the
 *  UI simple (a row of swatches instead of a full color input). */
export const PATIENT_TAG_COLORS = ["green", "blue", "purple", "amber", "red", "gray"] as const;
export type PatientTagColor = (typeof PATIENT_TAG_COLORS)[number];

export const PATIENT_TAG_COLOR_CLASSES: Record<PatientTagColor, string> = {
  green: "bg-emerald-100 text-emerald-800 border-emerald-200",
  blue: "bg-blue-100 text-blue-800 border-blue-200",
  purple: "bg-purple-100 text-purple-800 border-purple-200",
  amber: "bg-amber-100 text-amber-800 border-amber-200",
  red: "bg-red-100 text-red-800 border-red-200",
  gray: "bg-gray-100 text-gray-800 border-gray-200",
};

export type PatientTag = {
  id: string;
  patientId: string;
  label: string;
  color: PatientTagColor;
};

function fromRow(d: any): PatientTag {
  return { id: d.id, patientId: d.patient_id, label: d.label, color: (d.color as PatientTagColor) ?? "green" };
}

/** All tags across every patient of this professional — cheaper than one query per patient since
 *  the patient list screens already load every patient up front. */
export async function listTagsForProfessional(professionalId: string): Promise<PatientTag[]> {
  const { data, error } = await supabase
    .from("patient_tags")
    .select("id, patient_id, label, color")
    .eq("professional_id", professionalId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []).map(fromRow);
}

export async function createPatientTag(professionalId: string, patientId: string, label: string, color: PatientTagColor): Promise<void> {
  const { error } = await supabase.from("patient_tags").insert({ professional_id: professionalId, patient_id: patientId, label: label.trim(), color });
  if (error) throw error;
}

export async function deletePatientTag(tagId: string): Promise<void> {
  const { error } = await supabase.from("patient_tags").delete().eq("id", tagId);
  if (error) throw error;
}
