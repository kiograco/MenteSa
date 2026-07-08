import { renderTextDocumentToPdf, pdfToFile, loadImageAsDataUrl } from "./pdf";
import { generateReceiptDocument, getGeneratedDocumentSignedUrl, countReceiptsForProfessional } from "./generatedDocuments";

export type ReceiptInput = {
  patientId: string;
  patientName: string;
  patientCpf?: string | null;
  professionalId: string;
  professionalName: string;
  professionalLicense: string;
  professionalCpf?: string | null;
  professionalLogoUrl?: string | null;
  serviceDescription?: string;
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

/** Fields the Receita Saúde app requires that we can't guarantee are filled in — the receipt is
 *  still generated either way (this is a PDF for the professional/patient's own records, not a
 *  submission to the government system itself), but the caller should surface these as a warning
 *  so the professional knows to fill the gap before copying the data over to the official app. */
export function missingReceitaSaudeFields(input: Pick<ReceiptInput, "patientCpf" | "professionalCpf">): string[] {
  const missing: string[] = [];
  if (!input.professionalCpf) missing.push("CPF do profissional (Configurações → Faturamento e recibos)");
  if (!input.patientCpf) missing.push("CPF do paciente (ficha cadastral do paciente)");
  return missing;
}

/** Builds the recibo PDF, uploads it to generated_documents (document_type "recibo"), and returns
 *  a signed URL ready for immediate download. Includes every field the Receita Saúde app asks for
 *  (CPF de ambos, registro profissional, valor, data, descrição do serviço, numeração sequencial)
 *  so the professional can copy them over quickly — MindCare doesn't submit to Receita Saúde
 *  itself, that app requires the professional's own gov.br login. */
export async function generateReceiptPdf(input: ReceiptInput): Promise<string> {
  const scheduledLabel = new Date(input.scheduledAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  const paidLabel = new Date(input.paidAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  const amountLabel = `R$ ${input.amount.toFixed(2).replace(".", ",")}`;
  const methodLabel = METHOD_LABELS[input.method] ?? input.method;
  const description = input.serviceDescription?.trim() || "Sessão de psicoterapia individual, 50 minutos";
  const receiptNumber = (await countReceiptsForProfessional(input.professionalId).catch(() => 0)) + 1;

  const body = [
    `Recibo nº ${receiptNumber}`,
    "",
    `Recibo referente a ${description}, realizada em ${scheduledLabel}.`,
    "",
    `Paciente: ${input.patientName}${input.patientCpf ? ` — CPF ${input.patientCpf}` : ""}`,
    `Profissional: ${input.professionalName} — ${input.professionalLicense}${input.professionalCpf ? ` — CPF ${input.professionalCpf}` : ""}`,
    "",
    `Valor: ${amountLabel}`,
    `Forma de pagamento: ${methodLabel}`,
    `Pago em: ${paidLabel}`,
  ].join("\n");

  const logoDataUrl = input.professionalLogoUrl ? await loadImageAsDataUrl(input.professionalLogoUrl) : null;
  const doc = renderTextDocumentToPdf("Recibo de Pagamento", body, [input.professionalName, input.professionalLicense], logoDataUrl);
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
