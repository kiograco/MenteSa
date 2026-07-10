import { supabase } from "./supabase";
import type { AnswerOption, SeverityBand } from "./assessments";

export type AssessmentTemplate = {
  id: string;
  professionalId: string | null;
  name: string;
  questions: string[];
  answerOptions: AnswerOption[];
  severityBands: SeverityBand[];
};

function fromRow(d: any): AssessmentTemplate {
  return {
    id: d.id,
    professionalId: d.professional_id,
    name: d.name,
    questions: d.questions ?? [],
    answerOptions: d.answer_options ?? [],
    severityBands: d.severity_bands ?? [],
  };
}

/** Every template the caller's RLS session can see: built-ins (professional_id null) plus, for a
 *  professional, their own custom ones, or for a patient, any professional they have an
 *  appointment with — same result set works for both PatientDashboard's "Escalas" tab (answering)
 *  and EHRScreen's "Escalas" tab (professional's own templates, distinguished client-side by
 *  professionalId === null for built-ins vs === currentUser.id for editable ones). */
export async function listTemplates(): Promise<AssessmentTemplate[]> {
  const { data, error } = await supabase
    .from("assessment_templates")
    .select("id, professional_id, name, questions, answer_options, severity_bands")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []).map(fromRow);
}

export async function createTemplate(
  professionalId: string,
  name: string,
  questions: string[],
  answerOptions: AnswerOption[],
  severityBands: SeverityBand[]
): Promise<void> {
  const { error } = await supabase.from("assessment_templates").insert({
    professional_id: professionalId,
    name,
    questions,
    answer_options: answerOptions,
    severity_bands: severityBands,
  });
  if (error) throw error;
}

export async function updateTemplate(
  id: string,
  name: string,
  questions: string[],
  answerOptions: AnswerOption[],
  severityBands: SeverityBand[]
): Promise<void> {
  const { error } = await supabase
    .from("assessment_templates")
    .update({ name, questions, answer_options: answerOptions, severity_bands: severityBands })
    .eq("id", id);
  if (error) throw error;
}

/** Fails with a foreign-key error if any assessment_responses already reference this template —
 *  deliberate (no ON DELETE CASCADE): deleting a template definition should never silently wipe a
 *  patient's answered history. */
export async function deleteTemplate(id: string): Promise<void> {
  const { error } = await supabase.from("assessment_templates").delete().eq("id", id);
  if (error) throw error;
}
