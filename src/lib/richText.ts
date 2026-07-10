import type { JSONContent } from "@tiptap/react";

/** Wraps a plain string in the smallest valid Tiptap document — used when text coming from
 *  outside the editor (an AI rewrite, OCR transcription) needs to go back into a rich-text field.
 *  Always a single paragraph: it's a fresh insertion, not a formatting operation, so there's no
 *  richer structure to preserve. */
export function plainTextToTiptapJson(text: string): JSONContent {
  return { type: "doc", content: [{ type: "paragraph", content: text ? [{ type: "text", text }] : [] }] };
}

/** Extracts just the text content of a Tiptap document, dropping all formatting/marks — used
 *  anywhere a SOAP field needs to become a plain string again: the signature hash (the hash is of
 *  "what's visible", not the raw JSON), "Melhorar com IA" (sends plain text to Gemini), "Planejar
 *  sessão com IA" (builds a text prompt from past notes), and the Diário de Bordo timeline
 *  excerpts. Paragraphs are joined with newlines so multi-block content stays readable as text. */
export function tiptapJsonToPlainText(doc: JSONContent | null | undefined): string {
  if (!doc) return "";

  const collectText = (node: JSONContent): string => {
    if (node.type === "text") return node.text ?? "";
    return (node.content ?? []).map(collectText).join("");
  };

  const blocks = doc.content ?? [];
  return blocks.map(collectText).join("\n").trim();
}
