import { describe, expect, it } from "vitest";
import { classifyPaymentStatus } from "./paymentStatus";

describe("classifyPaymentStatus", () => {
  it("returns uncharged when there is no payment row", () => {
    expect(classifyPaymentStatus(null)).toBe("uncharged");
    expect(classifyPaymentStatus(undefined)).toBe("uncharged");
  });

  it("maps paid and refunded through directly", () => {
    expect(classifyPaymentStatus("paid")).toBe("paid");
    expect(classifyPaymentStatus("refunded")).toBe("refunded");
  });

  it("treats any other status (e.g. pending) as pending", () => {
    expect(classifyPaymentStatus("pending")).toBe("pending");
    expect(classifyPaymentStatus("in_process")).toBe("pending");
  });
});
