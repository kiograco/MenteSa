import { describe, expect, it } from "vitest";
import { bucketAmountsByMonth, getLastMonths } from "./revenue";

describe("getLastMonths", () => {
  it("returns the requested count of months ending at the reference month", () => {
    const months = getLastMonths(3, new Date("2026-07-15T00:00:00"));
    expect(months).toHaveLength(3);
    expect(months[2].key).toBe("2026-6"); // July is month index 6
    expect(months[0].key).toBe("2026-4"); // May
  });
});

describe("bucketAmountsByMonth", () => {
  it("sums amounts that fall within a bucket and ignores entries outside the window", () => {
    const months = getLastMonths(2, new Date("2026-07-15T00:00:00")); // June, July
    const entries = [
      { amount: 100, dateIso: "2026-07-01T00:00:00" },
      { amount: 50, dateIso: "2026-07-20T00:00:00" },
      { amount: 30, dateIso: "2026-06-05T00:00:00" },
      { amount: 999, dateIso: "2025-01-01T00:00:00" }, // outside the 2-month window
    ];

    const result = bucketAmountsByMonth(entries, months);

    expect(result).toEqual([
      { month: months[0].label, total: 30 },
      { month: months[1].label, total: 150 },
    ]);
  });
});
