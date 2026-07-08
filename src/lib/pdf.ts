import { jsPDF } from "jspdf";

const MARGIN_X = 56;
const TOP_MARGIN = 72;
const BOTTOM_MARGIN = 72;
const LINE_HEIGHT = 16;

/** Fetches an image (e.g. professional_profiles.logo_url) and returns it as a data: URL jsPDF's
 *  `addImage` can embed synchronously — jsPDF itself has no async image loading, so this has to
 *  happen before renderTextDocumentToPdf is called. Returns null on any failure (missing logo,
 *  network error) so callers can just skip the logo instead of failing the whole PDF. */
export async function loadImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Renders a simple letter-style PDF: bold title, a wrapped body (paragraphs separated by blank
 *  lines), and small gray footer lines (e.g. the signature block). Shared by recibo generation
 *  (src/lib/receipt.ts) and the Biblioteca de Modelos documents (src/lib/generatedDocuments.ts) —
 *  both just need "title + text + footer" on an A4 page, nothing fancier. `logoDataUrl` (from
 *  loadImageAsDataUrl) is stamped top-right when provided. */
export function renderTextDocumentToPdf(title: string, bodyText: string, footerLines: string[] = [], logoDataUrl?: string | null): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxWidth = pageWidth - MARGIN_X * 2;
  let y = TOP_MARGIN;

  if (logoDataUrl) {
    try {
      const format = /^data:image\/png/i.test(logoDataUrl) ? "PNG" : /^data:image\/webp/i.test(logoDataUrl) ? "WEBP" : "JPEG";
      doc.addImage(logoDataUrl, format, pageWidth - MARGIN_X - 60, TOP_MARGIN - 48, 60, 60, undefined, "FAST");
    } catch {
      // Malformed/unsupported image data (or a format jsPDF can't decode) — skip the logo rather
      // than fail the whole PDF.
    }
  }

  const ensureSpace = () => {
    if (y > pageHeight - BOTTOM_MARGIN) {
      doc.addPage();
      y = TOP_MARGIN;
    }
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(0);
  for (const line of doc.splitTextToSize(title, maxWidth)) {
    ensureSpace();
    doc.text(line, MARGIN_X, y);
    y += LINE_HEIGHT + 4;
  }
  y += 12;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  for (const paragraph of bodyText.split("\n")) {
    if (!paragraph.trim()) {
      y += LINE_HEIGHT;
      continue;
    }
    for (const line of doc.splitTextToSize(paragraph, maxWidth)) {
      ensureSpace();
      doc.text(line, MARGIN_X, y);
      y += LINE_HEIGHT;
    }
  }

  if (footerLines.length) {
    y += 24;
    doc.setFontSize(9);
    doc.setTextColor(120);
    for (const line of footerLines) {
      ensureSpace();
      doc.text(line, MARGIN_X, y);
      y += 12;
    }
  }

  return doc;
}

export function downloadPdf(doc: jsPDF, filename: string) {
  doc.save(filename);
}

export function pdfToFile(doc: jsPDF, filename: string): File {
  return new File([doc.output("blob")], filename, { type: "application/pdf" });
}
