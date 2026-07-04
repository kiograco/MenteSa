import { describe, expect, it } from "vitest";
import { scorePhq9, scoreGad7, PHQ9_QUESTIONS, GAD7_QUESTIONS } from "./assessments";

describe("scorePhq9", () => {
  it("scores 0 as Mínima", () => {
    expect(scorePhq9(new Array(9).fill(0))).toEqual({ totalScore: 0, severity: "Mínima" });
  });

  it("scores boundary values correctly (4 -> Mínima, 5 -> Leve)", () => {
    expect(scorePhq9([4, 0, 0, 0, 0, 0, 0, 0, 0]).severity).toBe("Mínima");
    expect(scorePhq9([5, 0, 0, 0, 0, 0, 0, 0, 0]).severity).toBe("Leve");
  });

  it("scores the maximum (27) as Severa", () => {
    expect(scorePhq9(new Array(9).fill(3))).toEqual({ totalScore: 27, severity: "Severa" });
  });

  it("has 9 questions", () => {
    expect(PHQ9_QUESTIONS).toHaveLength(9);
  });
});

describe("scoreGad7", () => {
  it("scores 0 as Mínima", () => {
    expect(scoreGad7(new Array(7).fill(0))).toEqual({ totalScore: 0, severity: "Mínima" });
  });

  it("scores boundary values correctly (14 -> Moderada, 15 -> Severa)", () => {
    expect(scoreGad7([14, 0, 0, 0, 0, 0, 0]).severity).toBe("Moderada");
    expect(scoreGad7([15, 0, 0, 0, 0, 0, 0]).severity).toBe("Severa");
  });

  it("scores the maximum (21) as Severa", () => {
    expect(scoreGad7(new Array(7).fill(3))).toEqual({ totalScore: 21, severity: "Severa" });
  });

  it("has 7 questions", () => {
    expect(GAD7_QUESTIONS).toHaveLength(7);
  });
});
