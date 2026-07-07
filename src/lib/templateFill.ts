export type DocumentTemplateType =
  | "declaracao_comparecimento"
  | "declaracao_acompanhamento"
  | "relatorio"
  | "parecer"
  | "laudo"
  | "encaminhamento";

export const DOCUMENT_TEMPLATE_TYPES: DocumentTemplateType[] = [
  "declaracao_comparecimento",
  "declaracao_acompanhamento",
  "relatorio",
  "parecer",
  "laudo",
  "encaminhamento",
];

export const DOCUMENT_TEMPLATE_LABELS: Record<DocumentTemplateType, string> = {
  declaracao_comparecimento: "Declaração de Comparecimento",
  declaracao_acompanhamento: "Declaração de Acompanhamento",
  relatorio: "Relatório",
  parecer: "Parecer",
  laudo: "Laudo",
  encaminhamento: "Encaminhamento",
};

/** Documents which {{placeholder}} keys fillTemplate understands. `autoFilled` ones are populated
 *  from patient/professional/appointment data (buildAutoFillData); the rest stay as literal
 *  `{{key}}` text in the preview for the professional to type over before exporting. */
export const TEMPLATE_PLACEHOLDERS: { key: string; label: string; autoFilled: boolean }[] = [
  { key: "paciente_nome", label: "Nome do paciente", autoFilled: true },
  { key: "paciente_cpf", label: "CPF do paciente", autoFilled: true },
  { key: "paciente_data_nascimento", label: "Data de nascimento do paciente", autoFilled: true },
  { key: "responsavel_legal_nome", label: "Nome do responsável legal", autoFilled: true },
  { key: "profissional_nome", label: "Nome do profissional", autoFilled: true },
  { key: "profissional_registro", label: "Registro profissional (CRP/CRM)", autoFilled: true },
  { key: "data_atual", label: "Data de hoje", autoFilled: true },
  { key: "hora_sessao", label: "Horário da sessão", autoFilled: true },
  { key: "duracao_sessao", label: "Duração da sessão", autoFilled: true },
  { key: "cidade", label: "Cidade do profissional", autoFilled: true },
  { key: "motivo", label: "Motivo", autoFilled: false },
  { key: "analise", label: "Análise", autoFilled: false },
  { key: "conclusao", label: "Conclusão", autoFilled: false },
  { key: "solicitante", label: "Solicitante", autoFilled: false },
  { key: "parecer_texto", label: "Texto do parecer", autoFilled: false },
  { key: "demanda", label: "Demanda", autoFilled: false },
  { key: "procedimentos", label: "Procedimentos/instrumentos utilizados", autoFilled: false },
  { key: "especialidade_destino", label: "Especialidade de destino", autoFilled: false },
];

/** Pure {{placeholder}} substitution — a key with no entry in `data` is left as literal text
 *  (`{{key}}`) rather than blanked out, so an unfilled field is obviously still a placeholder in
 *  the preview instead of silently disappearing. Kept free of the `supabase` import (unlike
 *  documentTemplates.ts) so it can be unit tested without initializing a Supabase client — same
 *  split as conversations.ts/messages.ts. */
export function fillTemplate(body: string, data: Record<string, string>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (match, key: string) => (key in data ? data[key] : match));
}

/** Builds the auto-fillable placeholder values from real patient/professional/appointment data. */
export function buildAutoFillData(params: {
  patientName: string;
  patientCpf?: string | null;
  patientBirthDate?: string | null;
  legalGuardianName?: string | null;
  professionalName: string;
  professionalLicense: string;
  professionalCity?: string | null;
  scheduledAt?: string | null;
  durationMinutes?: number | null;
}): Record<string, string> {
  const data: Record<string, string> = {
    paciente_nome: params.patientName,
    profissional_nome: params.professionalName,
    profissional_registro: params.professionalLicense,
    data_atual: new Date().toLocaleDateString("pt-BR"),
    cidade: params.professionalCity ?? "",
  };
  if (params.patientCpf) data.paciente_cpf = params.patientCpf;
  if (params.patientBirthDate) data.paciente_data_nascimento = new Date(params.patientBirthDate).toLocaleDateString("pt-BR");
  if (params.legalGuardianName) data.responsavel_legal_nome = params.legalGuardianName;
  if (params.scheduledAt) data.hora_sessao = new Date(params.scheduledAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (params.durationMinutes) data.duracao_sessao = `${params.durationMinutes} minutos`;
  return data;
}
