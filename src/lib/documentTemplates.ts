import { supabase } from "./supabase";
import { DOCUMENT_TEMPLATE_TYPES, type DocumentTemplateType } from "./templateFill";

export {
  DOCUMENT_TEMPLATE_TYPES, DOCUMENT_TEMPLATE_LABELS, TEMPLATE_PLACEHOLDERS,
  fillTemplate, buildAutoFillData, type DocumentTemplateType,
} from "./templateFill";

export type EffectiveTemplate = {
  type: DocumentTemplateType;
  title: string;
  body: string;
  isCustomized: boolean;
};

/** One effective template per type: the professional's own customization if they have one for
 *  that type, otherwise the system default (professional_id is null). */
export async function listEffectiveTemplates(professionalId: string): Promise<EffectiveTemplate[]> {
  const { data, error } = await supabase
    .from("document_templates")
    .select("professional_id, type, title, body")
    .or(`professional_id.is.null,professional_id.eq.${professionalId}`);

  if (error) throw error;

  const byType = new Map<string, EffectiveTemplate>();
  for (const row of data ?? []) {
    const isCustomized = row.professional_id === professionalId;
    if (isCustomized || !byType.has(row.type)) {
      byType.set(row.type, { type: row.type as DocumentTemplateType, title: row.title, body: row.body, isCustomized });
    }
  }
  return DOCUMENT_TEMPLATE_TYPES.map(type => byType.get(type)).filter((t): t is EffectiveTemplate => Boolean(t));
}

/** Saves the professional's own copy for this type — never touches the shared system default row. */
export async function saveTemplateCustomization(professionalId: string, type: DocumentTemplateType, title: string, body: string): Promise<void> {
  const { data: existing } = await supabase
    .from("document_templates")
    .select("id")
    .eq("professional_id", professionalId)
    .eq("type", type)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("document_templates")
      .update({ title, body, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("document_templates").insert({ professional_id: professionalId, type, title, body });
    if (error) throw error;
  }
}
