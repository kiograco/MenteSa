import { jsPDF } from "jspdf";

const MARGIN_X = 56;
const TOP_MARGIN = 72;
const BOTTOM_MARGIN = 72;
const LINE_HEIGHT = 16;

/** Renders a simple letter-style PDF: bold title, a wrapped body (paragraphs separated by blank
 *  lines), and small gray footer lines (e.g. the signature block). Shared by recibo generation
 *  (src/lib/receipt.ts) and the Biblioteca de Modelos documents (src/lib/generatedDocuments.ts) —
 *  both just need "title + text + footer" on an A4 page, nothing fancier. */
export function renderTextDocumentToPdf(title: string, bodyText: string, footerLines: string[] = []): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxWidth = pageWidth - MARGIN_X * 2;
  let y = TOP_MARGIN;

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
