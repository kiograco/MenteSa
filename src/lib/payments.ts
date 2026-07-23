import { supabase } from "./supabase";
import { classifyPaymentStatus, type AppointmentPaymentStatus } from "./paymentStatus";
import { extractFunctionErrorMessage, invokeEdgeFunction } from "./functionsClient";

export { classifyPaymentStatus, type AppointmentPaymentStatus } from "./paymentStatus";

export type AppointmentWithPaymentStatus = {
  appointmentId: string;
  patientId: string;
  patientName: string;
  scheduledAt: string;
  price: number;
  appointmentStatus: string;
  paymentStatus: AppointmentPaymentStatus;
  paymentId: string | null;
};

/** Lists a professional's appointments joined with their most recent payment's status — there's no
 *  denormalized "paid" flag on appointments, so this mirrors what FinancialDashboard already
 *  queries but keeps every status (not just "paid") and reduces payments to one row per
 *  appointment (the latest by created_at), since a single appointment can have more than one
 *  payments row (e.g. a retried or superseded charge). Pass `patientId` to scope this down to one
 *  patient's own statement (used by the "Financeiro do paciente" section in EHRScreen). */
export async function listAppointmentsWithPaymentStatus(professionalId: string, patientId?: string): Promise<AppointmentWithPaymentStatus[]> {
  let query = supabase
    .from("appointments")
    .select("id, patient_id, scheduled_at, price, status, profiles(full_name)")
    .eq("professional_id", professionalId)
    .order("scheduled_at", { ascending: false });

  if (patientId) query = query.eq("patient_id", patientId);

  const { data: appts, error: apptError } = await query;

  if (apptError) throw apptError;
  if (!appts?.length) return [];

  const apptIds = appts.map((a: any) => a.id);
  const { data: paymentRows, error: paymentError } = await supabase
    .from("payments")
    .select("id, appointment_id, status, created_at")
    .in("appointment_id", apptIds)
    .order("created_at", { ascending: false });

  if (paymentError) throw paymentError;

  const latestByAppointment = new Map<string, { id: string; status: string }>();
  for (const p of paymentRows ?? []) {
    if (!latestByAppointment.has(p.appointment_id)) {
      latestByAppointment.set(p.appointment_id, { id: p.id, status: p.status });
    }
  }

  return (appts as any[]).map(a => {
    const latest = latestByAppointment.get(a.id);
    return {
      appointmentId: a.id,
      patientId: a.patient_id,
      patientName: a.profiles?.full_name ?? "Paciente",
      scheduledAt: a.scheduled_at,
      price: Number(a.price),
      appointmentStatus: a.status,
      paymentStatus: classifyPaymentStatus(latest?.status),
      paymentId: latest?.id ?? null,
    };
  });
}

export async function getPayment(paymentId: string): Promise<{ method: string; amount: number; createdAt: string } | null> {
  const { data, error } = await supabase.from("payments").select("method, amount, created_at").eq("id", paymentId).maybeSingle();
  if (error) throw error;
  return data ? { method: data.method, amount: Number(data.amount), createdAt: data.created_at } : null;
}

export type PixChargeResult =
  | { ok: true; qrCode: string; qrCodeBase64: string | null; expiresAt: string | null }
  | { ok: false; error: string };

/** Calls create-asaas-pix-charge. Unlike createAsaasCheckout (which silently falls back to mock),
 *  this surfaces the server's error message — "Cobrar via Pix" is an explicit action the
 *  professional took, so a silent no-op would just look broken. */
export async function createPixCharge(appointmentId: string): Promise<PixChargeResult> {
  const { data, error } = await invokeEdgeFunction<{ qrCode?: string; qrCodeBase64?: string | null; expiresAt?: string | null }>(
    "create-asaas-pix-charge",
    { body: { appointmentId } }
  );

  if (error || !data?.qrCode) {
    return { ok: false, error: (await extractFunctionErrorMessage(error)) ?? "Não foi possível gerar a cobrança Pix." };
  }

  return { ok: true, qrCode: data.qrCode, qrCodeBase64: data.qrCodeBase64 ?? null, expiresAt: data.expiresAt ?? null };
}

/** Calls mark-appointment-paid — records a payment that happened outside the platform (cash,
 *  transfer). Same explicit-action-surfaces-errors reasoning as createPixCharge. */
export async function markAppointmentPaid(appointmentId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await invokeEdgeFunction<{ ok?: boolean }>("mark-appointment-paid", { body: { appointmentId } });

  if (error || !data?.ok) {
    return { ok: false, error: (await extractFunctionErrorMessage(error)) ?? "Não foi possível marcar como pago." };
  }

  return { ok: true };
}

export type NotaFiscalResult = { status: "unavailable" | "pending" | "issued" | "failed"; message: string; pdfUrl?: string | null };

export async function requestNotaFiscal(paymentId: string): Promise<NotaFiscalResult> {
  const { data, error } = await invokeEdgeFunction<{ status?: string; message?: string; pdfUrl?: string }>(
    "request-nota-fiscal",
    { body: { paymentId } }
  );

  if (error || !data?.status) {
    return { status: "failed", message: (await extractFunctionErrorMessage(error)) ?? "Não foi possível solicitar a nota fiscal." };
  }

  return { status: data.status as NotaFiscalResult["status"], message: data.message ?? "", pdfUrl: data.pdfUrl ?? null };
}
