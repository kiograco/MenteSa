import { renderTextDocumentToPdf, pdfToFile } from "./pdf";
import { generateReceiptDocument, getGeneratedDocumentSignedUrl } from "./generatedDocuments";

export type ReceiptInput = {
  patientId: string;
  patientName: string;
  patientCpf?: string | null;
  professionalId: string;
  professionalName: string;
  professionalLicense: string;
  appointmentId: string;
  scheduledAt: string;
  paymentId: string;
  amount: number;
  method: string;
  paidAt: string;
};

const METHOD_LABELS: Record<string, string> = {
  pix: "Pix",
  card: "Cartão",
  credit_card: "Cartão de crédito",
  mock: "Particular",
};

/** Builds the recibo PDF, uploads it to generated_documents (document_type "recibo"), and returns
 *  a signed URL ready for immediate download. */
export async function generateReceiptPdf(input: ReceiptInput): Promise<string> {
  const scheduledLabel = new Date(input.scheduledAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  const paidLabel = new Date(input.paidAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  const amountLabel = `R$ ${input.amount.toFixed(2).replace(".", ",")}`;
  const methodLabel = METHOD_LABELS[input.method] ?? input.method;

  const body = [
    `Recibo referente à sessão de psicoterapia realizada em ${scheduledLabel}.`,
    "",
    `Paciente: ${input.patientName}${input.patientCpf ? ` — CPF ${input.patientCpf}` : ""}`,
    `Profissional: ${input.professionalName} — ${input.professionalLicense}`,
    "",
    `Valor: ${amountLabel}`,
    `Forma de pagamento: ${methodLabel}`,
    `Pago em: ${paidLabel}`,
  ].join("\n");

  const doc = renderTextDocumentToPdf("Recibo de Pagamento", body, [input.professionalName, input.professionalLicense]);
  const file = pdfToFile(doc, `recibo-${input.appointmentId}-${Date.now()}.pdf`);

  const { storagePath } = await generateReceiptDocument({
    patientId: input.patientId,
    professionalId: input.professionalId,
    appointmentId: input.appointmentId,
    paymentId: input.paymentId,
    file,
  });

  return getGeneratedDocumentSignedUrl(storagePath);
}
