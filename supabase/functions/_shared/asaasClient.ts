// Thin wrapper around the Asaas REST API, shared by every payment Edge Function (create-asaas-preference,
// create-asaas-subscription, create-asaas-pix-charge/auto-charge-sessions via pixCharge.ts). Asaas
// auths with a plain `access_token` header (not `Authorization: Bearer`, unlike Mercado Pago) — see
// https://docs.asaas.com/docs/autenticação.
//
// ASAAS_API_URL defaults to production; point it at "https://api-sandbox.asaas.com/v3" while testing.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

const DEFAULT_API_URL = "https://api.asaas.com/v3";

export function asaasApiUrl(): string {
  return Deno.env.get("ASAAS_API_URL") || DEFAULT_API_URL;
}

export async function asaasFetch(path: string, apiKey: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${asaasApiUrl()}${path}`, {
    ...init,
    headers: {
      access_token: apiKey,
      "Content-Type": "application/json",
      "User-Agent": "MindCare (MenteSa)",
      ...init.headers,
    },
  });
}

type CustomerTable = "professional_profiles" | "patient_profiles";

/** Returns the cached Asaas customer id for this professional/patient, creating one (and caching
 *  it back onto the row) the first time they're ever charged. `cpfCnpj` is required by Asaas to
 *  create a customer — callers must check for it themselves and surface a clear "complete seu
 *  cadastro" error before calling this, since there's no good generic error to synthesize here. */
export async function getOrCreateAsaasCustomer(
  adminClient: SupabaseClient,
  table: CustomerTable,
  id: string,
  apiKey: string,
  info: { name: string; email: string; cpfCnpj: string }
): Promise<{ ok: true; customerId: string } | { ok: false; error: string }> {
  const { data: row } = await adminClient.from(table).select("asaas_customer_id").eq("id", id).maybeSingle();
  if (row?.asaas_customer_id) return { ok: true, customerId: row.asaas_customer_id };

  const response = await asaasFetch("/customers", apiKey, {
    method: "POST",
    body: JSON.stringify({
      name: info.name,
      email: info.email,
      cpfCnpj: info.cpfCnpj.replace(/\D/g, ""),
      externalReference: id,
    }),
  });

  if (!response.ok) {
    return { ok: false, error: `Falha ao criar cliente no Asaas: ${await response.text()}` };
  }

  const customer = await response.json();
  await adminClient.from(table).update({ asaas_customer_id: customer.id }).eq("id", id);
  return { ok: true, customerId: customer.id };
}

/** YYYY-MM-DD in the app's local date, which is what Asaas's date fields (dueDate/nextDueDate) expect. */
export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}
