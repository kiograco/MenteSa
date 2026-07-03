import { describe, expect, it } from "vitest";
import { formatAiSummaryText } from "./aiSummary";

describe("formatAiSummaryText", () => {
  it("renders all three sections in order when all fields are present", () => {
    const text = formatAiSummaryText({
      keyPoints: ["Melhora da ansiedade"],
      actionItems: ["Praticar respiração 3x/dia"],
      clinicalNote: "Paciente demonstra progresso.",
    });
    expect(text).toBe(
      "Pontos-chave:\n- Melhora da ansiedade\n\nItens de ação:\n- Praticar respiração 3x/dia\n\nNota clínica:\nPaciente demonstra progresso."
    );
  });

  it("omits empty sections instead of leaving blank headers", () => {
    const text = formatAiSummaryText({ keyPoints: [], actionItems: [], clinicalNote: "Nota única." });
    expect(text).toBe("Nota clínica:\nNota única.");
  });

  it("joins multiple key points and action items as separate bullet lines", () => {
    const text = formatAiSummaryText({
      keyPoints: ["Ponto A", "Ponto B"],
      actionItems: ["Ação A", "Ação B"],
      clinicalNote: "",
    });
    expect(text).toBe("Pontos-chave:\n- Ponto A\n- Ponto B\n\nItens de ação:\n- Ação A\n- Ação B");
  });

  it("returns an empty string when everything is empty", () => {
    expect(formatAiSummaryText({ keyPoints: [], actionItems: [], clinicalNote: "" })).toBe("");
  });
});
