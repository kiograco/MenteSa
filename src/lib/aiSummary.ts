import type { AISessionSummary } from "./ai";

/** Formats an AI-generated session summary into the single plain-text string stored in
 *  session_notes.ai_summary (a `text` column — no schema change, just a readable format).
 *  Empty sections are omitted rather than left as blank headers. */
export function formatAiSummaryText(summary: AISessionSummary): string {
  const lines: string[] = [];

  if (summary.keyPoints.length > 0) {
    lines.push("Pontos-chave:");
    summary.keyPoints.forEach(p => lines.push(`- ${p}`));
  }

  if (summary.actionItems.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push("Itens de ação:");
    summary.actionItems.forEach(a => lines.push(`- ${a}`));
  }

  if (summary.clinicalNote.trim()) {
    if (lines.length > 0) lines.push("");
    lines.push("Nota clínica:", summary.clinicalNote.trim());
  }

  return lines.join("\n");
}
