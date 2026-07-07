import { describe, expect, it } from "vitest";
import { calculateAttendanceRate, calculateCancellationRate, calculateNoShowRate, calculateRetentionRate } from "./metrics";

describe("calculateAttendanceRate", () => {
  it("returns 0 when there are no past appointments", () => {
    expect(calculateAttendanceRate([])).toBe(0);
    expect(calculateAttendanceRate([{ status: "scheduled", patientId: "a" }])).toBe(0);
  });

  it("ignores scheduled (future) appointments", () => {
    const rate = calculateAttendanceRate([
      { status: "completed", patientId: "a" },
      { status: "scheduled", patientId: "b" },
    ]);
    expect(rate).toBe(1);
  });

  it("computes completed / (completed + cancelled)", () => {
    const rate = calculateAttendanceRate([
      { status: "completed", patientId: "a" },
      { status: "completed", patientId: "b" },
      { status: "cancelled", patientId: "c" },
      { status: "cancelled", patientId: "d" },
    ]);
    expect(rate).toBe(0.5);
  });

  it("counts no_show as past but not as attended", () => {
    const rate = calculateAttendanceRate([
      { status: "completed", patientId: "a" },
      { status: "no_show", patientId: "b" },
    ]);
    expect(rate).toBe(0.5);
  });
});

describe("calculateNoShowRate", () => {
  it("returns 0 when there are no past appointments", () => {
    expect(calculateNoShowRate([])).toBe(0);
    expect(calculateNoShowRate([{ status: "scheduled", patientId: "a" }])).toBe(0);
  });

  it("computes no_show / (completed + cancelled + no_show)", () => {
    const rate = calculateNoShowRate([
      { status: "completed", patientId: "a" },
      { status: "no_show", patientId: "b" },
      { status: "no_show", patientId: "c" },
      { status: "cancelled", patientId: "d" },
    ]);
    expect(rate).toBe(0.5);
  });
});

describe("calculateCancellationRate", () => {
  it("is the complement of attendance rate over the same past appointments", () => {
    const appointments = [
      { status: "completed", patientId: "a" },
      { status: "cancelled", patientId: "b" },
      { status: "cancelled", patientId: "c" },
    ];
    expect(calculateCancellationRate(appointments)).toBeCloseTo(2 / 3);
  });

  it("returns 0 when there are no past appointments", () => {
    expect(calculateCancellationRate([{ status: "scheduled", patientId: "a" }])).toBe(0);
  });
});

describe("calculateRetentionRate", () => {
  it("returns 0 for an empty list", () => {
    expect(calculateRetentionRate([])).toBe(0);
  });

  it("counts a patient as retained once they have 2+ appointments", () => {
    const rate = calculateRetentionRate([
      { status: "completed", patientId: "a" },
      { status: "completed", patientId: "a" },
      { status: "completed", patientId: "b" },
    ]);
    expect(rate).toBeCloseTo(1 / 2);
  });

  it("returns 1 when every patient has returned", () => {
    const rate = calculateRetentionRate([
      { status: "completed", patientId: "a" },
      { status: "completed", patientId: "a" },
      { status: "completed", patientId: "b" },
      { status: "completed", patientId: "b" },
    ]);
    expect(rate).toBe(1);
  });
});
