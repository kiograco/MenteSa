import { supabase } from "./supabase";
import { extractFunctionErrorMessage, invokeEdgeFunction } from "./functionsClient";

export type SubscriptionPlan = { id: string; name: string; price: number; billingInterval: string };
export type ProfessionalSubscription = {
  planId: string;
  status: "pending" | "active" | "cancelled" | "past_due";
  planName: string;
  currentPeriodEnd: string | null;
};

export async function listPlans(): Promise<SubscriptionPlan[]> {
  const { data, error } = await supabase.from("subscription_plans").select("id, name, price, billing_interval").eq("active", true);
  if (error) throw error;
  return (data ?? []).map(d => ({ id: d.id, name: d.name, price: Number(d.price), billingInterval: d.billing_interval }));
}

/** The professional's most recent subscription row, if any — asaas-webhook is the only
 *  writer of `status`/`current_period_end`, same trust boundary as `payments`. */
export async function getMySubscription(professionalId: string): Promise<ProfessionalSubscription | null> {
  const { data, error } = await supabase
    .from("professional_subscriptions")
    .select("plan_id, status, current_period_end, subscription_plans(name)")
    .eq("professional_id", professionalId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as any;
  return { planId: row.plan_id, status: row.status, planName: row.subscription_plans?.name ?? "Plano", currentPeriodEnd: row.current_period_end };
}

/** Calls create-asaas-subscription — returns the Asaas hosted invoice URL to redirect the
 *  professional to for paying the first cycle of the recurring charge. `checkoutUrl` comes back
 *  `null` (not an error) when a coupon discounted the plan down to R$0 — there's nothing to charge,
 *  so the function activates the subscription directly instead of routing a zero-value charge
 *  through Asaas, and there's no invoice page to redirect to. Surfaces the server's error message
 *  since this is an explicit action the professional took. */
export async function createSubscription(
  planId: string,
  couponCode?: string
): Promise<{ ok: true; checkoutUrl: string | null } | { ok: false; error: string }> {
  const { data, error } = await invokeEdgeFunction<{ checkoutUrl?: string | null }>("create-asaas-subscription", {
    body: { planId, couponCode: couponCode || undefined },
  });
  if (error || !data) {
    return { ok: false, error: (await extractFunctionErrorMessage(error)) ?? "Não foi possível iniciar a assinatura." };
  }
  return { ok: true, checkoutUrl: data.checkoutUrl ?? null };
}

export type SubscriptionAccess = { unlocked: boolean; status: ProfessionalSubscription["status"] | "none"; payingProfessionalId: string };

/** Whether `professionalId` can actively use the platform (Agenda/Pacientes/Prontuário/Financeiro/
 *  IA/Biblioteca) — cadastro/Configurações is always available regardless, since that's how the
 *  professional actually gets to the point of paying. One subscription per clinic covers every
 *  professional registered under it (professional_profiles.clinic_id), so a clinic member's access
 *  resolves through the clinic OWNER's subscription, not their own — they never need a plan of
 *  their own (professional_subscriptions_select_clinic_member, migration 20260721000000, is what
 *  lets them read that row at all). Purely a UI gate: it hides/disables write actions, RLS is the
 *  actual security boundary for the data underneath. */
export async function getSubscriptionAccess(professionalId: string): Promise<SubscriptionAccess> {
  const { data: profRow } = await supabase.from("professional_profiles").select("clinic_id").eq("id", professionalId).maybeSingle();

  let payingProfessionalId = professionalId;
  if (profRow?.clinic_id) {
    const { data: clinic } = await supabase.from("clinics").select("owner_professional_id").eq("id", profRow.clinic_id).maybeSingle();
    if (clinic) payingProfessionalId = clinic.owner_professional_id;
  }

  const subscription = await getMySubscription(payingProfessionalId);
  return { unlocked: subscription?.status === "active", status: subscription?.status ?? "none", payingProfessionalId };
}
