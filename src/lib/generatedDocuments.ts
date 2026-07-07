import { supabase } from "./supabase";
import { hashDocumentText } from "./consent";
import { pdfToFile, renderTextDocumentToPdf } from "./pdf";

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
    createdAt: d.created_at,
  };
}

export async function listGeneratedDocuments(patientId: string): Promise<GeneratedDocument[]> {
  const { data, error } = await supabase
    .from("generated_documents")
    .select("id, document_type, patient_id, professional_id, appointment_id, payment_id, storage_path, file_name, signed_at, typed_name, created_at")
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
}): Promise<{ documentId: string; storagePath: string; signed: boolean }> {
  const doc = renderTextDocumentToPdf(params.title, params.filledBody, [
    `Assinado digitalmente por ${params.typedName}`,
    new Date().toLocaleString("pt-BR"),
  ]);
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
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean }>("sign-generated-document", {
    body: { documentId, typedName: params.typedName, documentHash: hash },
  });

  return { documentId, storagePath, signed: !error && Boolean(data?.ok) };
}
