import { supabase } from "./supabase";
import { invokeEdgeFunction } from "./functionsClient";

export interface ChargeRequest {
  appointmentId: string;
  amount: number;
  method: "pix" | "card";
}

export interface ChargeResult {
  status: "paid" | "pending" | "refunded";
  providerReference: string;
}

/**
 * Abstraction point for the real payment gateway (Asaas). Swap `mockPaymentProvider` for an
 * Asaas-backed implementation without touching CheckoutScreen or any other call site.
 */
export interface PaymentProvider {
  charge(request: ChargeRequest): Promise<ChargeResult>;
}

const PLATFORM_FEE_RATE = 0.1;

export const mockPaymentProvider: PaymentProvider = {
  async charge({ appointmentId, amount, method }) {
    const result: ChargeResult = {
      status: "paid",
      providerReference: `mock_${crypto.randomUUID()}`,
    };

    const { error } = await supabase.from("payments").insert({
      appointment_id: appointmentId,
      status: result.status,
      method,
      amount,
      platform_fee: Number((amount * PLATFORM_FEE_RATE).toFixed(2)),
      provider: "mock",
    });

    if (error) throw error;
    return result;
  },
};

/**
 * Real payment path: asks the create-asaas-preference Edge Function for an Asaas hosted invoice
 * URL and returns it so the caller can redirect the browser there. Returns null (never throws)
 * when the function isn't deployed/configured yet, so CheckoutScreen can fall back to the mock
 * flow — same graceful-degradation pattern used for LiveKit video.
 */
export async function createAsaasCheckout(appointmentId: string): Promise<string | null> {
  const { data, error } = await invokeEdgeFunction<{ checkoutUrl?: string }>("create-asaas-preference", {
    body: { appointmentId },
  });

  if (error || !data?.checkoutUrl) return null;
  return data.checkoutUrl;
}
