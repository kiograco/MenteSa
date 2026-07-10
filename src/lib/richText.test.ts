import { describe, expect, it } from "vitest";
import { plainTextToTiptapJson, tiptapJsonToPlainText } from "./richText";

describe("plainTextToTiptapJson / tiptapJsonToPlainText round trip", () => {
  it("round-trips plain text through a single paragraph", () => {
    expect(tiptapJsonToPlainText(plainTextToTiptapJson("Paciente relata melhora no sono."))).toBe("Paciente relata melhora no sono.");
  });

  it("round-trips an empty string", () => {
    expect(tiptapJsonToPlainText(plainTextToTiptapJson(""))).toBe("");
  });
});

describe("tiptapJsonToPlainText", () => {
  it("returns an empty string for null/undefined", () => {
    expect(tiptapJsonToPlainText(null)).toBe("");
    expect(tiptapJsonToPlainText(undefined)).toBe("");
  });

  it("joins multiple paragraphs with newlines", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Primeira linha" }] },
        { type: "paragraph", content: [{ type: "text", text: "Segunda linha" }] },
      ],
    };
    expect(tiptapJsonToPlainText(doc)).toBe("Primeira linha\nSegunda linha");
  });

  it("drops formatting marks, keeping only text", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "negrito", marks: [{ type: "bold" }] }, { type: "text", text: " normal" }] },
      ],
    };
    expect(tiptapJsonToPlainText(doc)).toBe("negrito normal");
  });

  it("handles a bullet list by concatenating item text", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Item 1" }] }] },
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Item 2" }] }] },
          ],
        },
      ],
    };
    expect(tiptapJsonToPlainText(doc)).toBe("Item 1Item 2");
  });
});
