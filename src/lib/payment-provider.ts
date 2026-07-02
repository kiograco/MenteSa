import { supabase } from "./supabase";

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
 * Abstraction point for the real payment gateway (Mercado Pago) planned for
 * post-MVP. Swap `mockPaymentProvider` for a Mercado Pago-backed implementation
 * without touching CheckoutScreen or any other call site.
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
