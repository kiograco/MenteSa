import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

describe("toCsv", () => {
  it("joins rows and cells with commas and newlines", () => {
    expect(toCsv([["Nome", "Tipo"], ["Ana", "Paciente"]])).toBe('"Nome","Tipo"\n"Ana","Paciente"');
  });

  it("escapes double quotes inside a cell", () => {
    expect(toCsv([['Dr. "Rafael"']])).toBe('"Dr. ""Rafael"""');
  });
});
