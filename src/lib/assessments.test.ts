import { describe, expect, it } from "vitest";
import { scoreFromTemplate, type SeverityBand } from "./assessments";

// Same cutoffs as the PHQ-9/GAD-7 built-in templates seeded in migration 20260718000000 —
// regression coverage to make sure the generic scorer reproduces the old hardcoded behavior.
const PHQ9_BANDS: SeverityBand[] = [
  { max: 4, label: "Mínima" },
  { max: 9, label: "Leve" },
  { max: 14, label: "Moderada" },
  { max: 19, label: "Moderadamente severa" },
  { max: null, label: "Severa" },
];

const GAD7_BANDS: SeverityBand[] = [
  { max: 4, label: "Mínima" },
  { max: 9, label: "Leve" },
  { max: 14, label: "Moderada" },
  { max: null, label: "Severa" },
];

describe("scoreFromTemplate (PHQ-9 bands)", () => {
  it("scores 0 as Mínima", () => {
    expect(scoreFromTemplate(new Array(9).fill(0), PHQ9_BANDS)).toEqual({ totalScore: 0, severity: "Mínima" });
  });

  it("scores boundary values correctly (4 -> Mínima, 5 -> Leve)", () => {
    expect(scoreFromTemplate([4, 0, 0, 0, 0, 0, 0, 0, 0], PHQ9_BANDS).severity).toBe("Mínima");
    expect(scoreFromTemplate([5, 0, 0, 0, 0, 0, 0, 0, 0], PHQ9_BANDS).severity).toBe("Leve");
  });

  it("scores the maximum (27) as Severa", () => {
    expect(scoreFromTemplate(new Array(9).fill(3), PHQ9_BANDS)).toEqual({ totalScore: 27, severity: "Severa" });
  });
});

describe("scoreFromTemplate (GAD-7 bands)", () => {
  it("scores 0 as Mínima", () => {
    expect(scoreFromTemplate(new Array(7).fill(0), GAD7_BANDS)).toEqual({ totalScore: 0, severity: "Mínima" });
  });

  it("scores boundary values correctly (14 -> Moderada, 15 -> Severa)", () => {
    expect(scoreFromTemplate([14, 0, 0, 0, 0, 0, 0], GAD7_BANDS).severity).toBe("Moderada");
    expect(scoreFromTemplate([15, 0, 0, 0, 0, 0, 0], GAD7_BANDS).severity).toBe("Severa");
  });

  it("scores the maximum (21) as Severa", () => {
    expect(scoreFromTemplate(new Array(7).fill(3), GAD7_BANDS)).toEqual({ totalScore: 21, severity: "Severa" });
  });
});

describe("scoreFromTemplate (generic)", () => {
  it("works with a custom 2-question template with its own bands", () => {
    const bands: SeverityBand[] = [{ max: 2, label: "Baixo" }, { max: null, label: "Alto" }];
    expect(scoreFromTemplate([1, 1], bands).severity).toBe("Baixo");
    expect(scoreFromTemplate([2, 2], bands).severity).toBe("Alto");
  });
});
