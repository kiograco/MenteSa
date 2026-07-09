import { describe, expect, it } from "vitest";
import { canEnterSession } from "./sessionAccess";

const SCHEDULED_AT = "2026-07-09T15:00:00.000Z";

describe("canEnterSession", () => {
  it("hides entry before the five-minute window", () => {
    expect(canEnterSession(SCHEDULED_AT, new Date("2026-07-09T14:54:59.999Z").getTime())).toBe(false);
  });

  it("allows entry exactly five minutes before the session", () => {
    expect(canEnterSession(SCHEDULED_AT, new Date("2026-07-09T14:55:00.000Z").getTime())).toBe(true);
  });

  it("allows entry after the session start time", () => {
    expect(canEnterSession(SCHEDULED_AT, new Date("2026-07-09T15:01:00.000Z").getTime())).toBe(true);
  });

  it("rejects an invalid session date", () => {
    expect(canEnterSession("invalid-date")).toBe(false);
  });
});
