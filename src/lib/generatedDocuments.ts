import { supabase } from "./supabase";
import { invokeEdgeFunction } from "./functionsClient";
import { hashDocumentText } from "./consent";
import { pdfToFile, renderTextDocumentToPdf, loadImageAsDataUrl } from "./pdf";

const BUCKET = "generated-documents";

export type DocumentType =
  | "recibo"
  | "declaracao_comparecimento"
  | "declaracao_acompanhamento"
  | "relatorio"
  | "parecer"
  | "laudo"
  | "encaminhamento";

export type GeneratedDocument = {
  id: string;
  documentType: DocumentType;
  patientId: string;
  professionalId: string;
  appointmentId: string | null;
  paymentId: string | null;
  storagePath: string;
  fileName: string;
  signedAt: string | null;
  typedName: string | null;
  sentToPatientAt: string | null;
  createdAt: string;
};

function fromRow(d: any): GeneratedDocument {
  return {
    id: d.id,
    documentType: d.document_type,
    patientId: d.patient_id,
    professionalId: d.professional_id,
    appointmentId: d.appointment_id,
    paymentId: d.payment_id,
    storagePath: d.storage_path,
    fileName: d.file_name,
    signedAt: d.signed_at,
    typedName: d.typed_name,
    sentToPatientAt: d.sent_to_patient_at,
    createdAt: d.created_at,
  };
}

/** Called by the professional (sees every document for that patient) or by the patient themselves
 *  (RLS silently limits the result to documents already sent to them — generated_documents_select_patient). */
export async function listGeneratedDocuments(patientId: string): Promise<GeneratedDocument[]> {
  const { data, error } = await supabase
    .from("generated_documents")
    .select("id, document_type, patient_id, professional_id, appointment_id, payment_id, storage_path, file_name, signed_at, typed_name, sent_to_patient_at, created_at")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(fromRow);
}

export async function getGeneratedDocumentSignedUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 60);
  if (error) throw error;
  return data.signedUrl;
}

/** Marks a document as sent — only the owning professional can (generated_documents_update_professional).
 *  This is what makes it show up in the patient's own document list (RLS gates their read on this). */
export async function markGeneratedDocumentSent(documentId: string): Promise<void> {
  const { error } = await supabase
    .from("generated_documents")
    .update({ sent_to_patient_at: new Date().toISOString() })
    .eq("id", documentId);
  if (error) throw error;
}

/** Downloads the PDF as a blob and prints it via a same-origin blob: URL — a signed storage URL is
 *  cross-origin, and browsers restrict enough of the cross-origin Window API that triggering print
 *  reliably needs same-origin. Opens the tab synchronously (before the download) so browsers don't
 *  treat it as an unrequested popup once the async download resolves. */
export async function printGeneratedDocument(storagePath: string): Promise<void> {
  const printWindow = window.open("", "_blank");

  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error || !data) {
    printWindow?.close();
    throw error ?? new Error("Não foi possível baixar o documento.");
  }

  const blobUrl = URL.createObjectURL(data);
  if (!printWindow) {
    // Popup blocked — fall back to a normal tab the user can print from manually (Ctrl/Cmd+P).
    window.open(blobUrl, "_blank", "noopener,noreferrer");
    return;
  }

  printWindow.location.href = blobUrl;
  printWindow.addEventListener("load", () => printWindow.print());
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
}

/** Uploads a PDF already built with src/lib/pdf.ts and records its metadata row. Used directly for
 *  recibo (no signature needed) and by generateAndSignDocument below (Biblioteca de Modelos). */
async function uploadGeneratedDocument(params: {
  documentType: DocumentType;
  patientId: string;
  professionalId: string;
  appointmentId?: string | null;
  paymentId?: string | null;
  file: File;
}): Promise<{ id: string; storagePath: string }> {
  const path = `${params.patientId}/${Date.now()}-${params.file.name}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, params.file);
  if (uploadError) throw uploadError;

  const { data, error: insertError } = await supabase
    .from("generated_documents")
    .insert({
      document_type: params.documentType,
      patient_id: params.patientId,
      professional_id: params.professionalId,
      appointment_id: params.appointmentId ?? null,
      payment_id: params.paymentId ?? null,
      storage_path: path,
      file_name: params.file.name,
    })
    .select("id")
    .single();

  if (insertError) throw insertError;

  return { id: data.id, storagePath: path };
}

export async function generateReceiptDocument(params: {
  patientId: string;
  professionalId: string;
  appointmentId: string;
  paymentId: string;
  file: File;
}): Promise<{ id: string; storagePath: string }> {
  return uploadGeneratedDocument({ ...params, documentType: "recibo" });
}

/** Sequential numbering for recibos (Receita Saúde expects a receipt number) — just a count of
 *  this professional's past recibos, not a gapless invoice sequence (a deleted row would shift
 *  it, but nothing here ever deletes a generated_documents row). */
export async function countReceiptsForProfessional(professionalId: string): Promise<number> {
  const { count, error } = await supabase
    .from("generated_documents")
    .select("id", { count: "exact", head: true })
    .eq("professional_id", professionalId)
    .eq("document_type", "recibo");
  if (error) throw error;
  return count ?? 0;
}

/** Renders the filled template to PDF, uploads it, then signs it via the sign-generated-document
 *  Edge Function — same trust model as sign-session-note: only the function ever writes
 *  signed_at/typed_name/signature_hash, so the signature record can be trusted. Returns null if
 *  the signature call fails; the PDF row itself is still uploaded (professional can retry signing
 *  rather than losing the generated content). */
export async function generateAndSignDocument(params: {
  documentType: Exclude<DocumentType, "recibo">;
  title: string;
  filledBody: string;
  patientId: string;
  professionalId: string;
  appointmentId?: string | null;
  typedName: string;
  professionalLogoUrl?: string | null;
}): Promise<{ documentId: string; storagePath: string; signed: boolean }> {
  const logoDataUrl = params.professionalLogoUrl ? await loadImageAsDataUrl(params.professionalLogoUrl) : null;
  const doc = renderTextDocumentToPdf(params.title, params.filledBody, [
    `Assinado digitalmente por ${params.typedName}`,
    new Date().toLocaleString("pt-BR"),
  ], logoDataUrl);
  const fileName = `${params.documentType}-${Date.now()}.pdf`;
  const file = pdfToFile(doc, fileName);

  const { id: documentId, storagePath } = await uploadGeneratedDocument({
    documentType: params.documentType,
    patientId: params.patientId,
    professionalId: params.professionalId,
    appointmentId: params.appointmentId,
    file,
  });

  const hash = await hashDocumentText(params.filledBody);
  const { data, error } = await invokeEdgeFunction<{ ok?: boolean }>("sign-generated-document", {
    body: { documentId, typedName: params.typedName, documentHash: hash },
  });

  return { documentId, storagePath, signed: !error && Boolean(data?.ok) };
}
