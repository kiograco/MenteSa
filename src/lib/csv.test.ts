import { describe, expect, it } from "vitest";
import { parseCsv, toCsv } from "./csv";

describe("toCsv", () => {
  it("joins rows and cells with commas and newlines", () => {
    expect(toCsv([["Nome", "Tipo"], ["Ana", "Paciente"]])).toBe('"Nome","Tipo"\n"Ana","Paciente"');
  });

  it("escapes double quotes inside a cell", () => {
    expect(toCsv([['Dr. "Rafael"']])).toBe('"Dr. ""Rafael"""');
  });
});

describe("parseCsv", () => {
  it("round-trips whatever toCsv produces", () => {
    const rows = [["Nome", "E-mail"], ["Ana Silva", "ana@example.com"], ['Dr. "Rafael"', "r@example.com"]];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });

  it("parses a plain unquoted CSV", () => {
    expect(parseCsv("Nome,E-mail\nAna,ana@example.com")).toEqual([["Nome", "E-mail"], ["Ana", "ana@example.com"]]);
  });

  it("handles a comma inside a quoted field", () => {
    expect(parseCsv('"Silva, Ana","ana@example.com"')).toEqual([["Silva, Ana", "ana@example.com"]]);
  });

  it("ignores blank lines", () => {
    expect(parseCsv("Nome,E-mail\n\nAna,ana@example.com\n")).toEqual([["Nome", "E-mail"], ["Ana", "ana@example.com"]]);
  });
});
