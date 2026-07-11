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

/** The professional's most recent subscription row, if any — mercadopago-webhook is the only
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

/** Calls create-mp-subscription — returns the Mercado Pago hosted checkout URL to redirect the
 *  professional to for approving the recurring charge. Surfaces the server's error message since
 *  this is an explicit action the professional took. */
export async function createSubscription(planId: string): Promise<{ ok: true; initPoint: string } | { ok: false; error: string }> {
  const { data, error } = await invokeEdgeFunction<{ initPoint?: string }>("create-mp-subscription", { body: { planId } });
  if (error || !data?.initPoint) {
    return { ok: false, error: (await extractFunctionErrorMessage(error)) ?? "Não foi possível iniciar a assinatura." };
  }
  return { ok: true, initPoint: data.initPoint };
}
