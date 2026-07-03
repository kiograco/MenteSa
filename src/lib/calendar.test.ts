import { describe, expect, it } from "vitest";
import { getWeekDays, getWeekStart, isSameDay } from "./calendar";

describe("getWeekStart", () => {
  it("returns the same Monday when given a Monday", () => {
    // 2026-07-06 is a Monday
    const start = getWeekStart(new Date("2026-07-06T15:30:00"));
    expect(start.getDay()).toBe(1);
    expect(start.getDate()).toBe(6);
    expect(start.getHours()).toBe(0);
  });

  it("rolls a Sunday back to the previous Monday, not forward", () => {
    // 2026-07-12 is a Sunday
    const start = getWeekStart(new Date("2026-07-12T00:00:00"));
    expect(start.getDay()).toBe(1);
    expect(start.getDate()).toBe(6);
  });

  it("rolls a mid-week date back to that week's Monday", () => {
    // 2026-07-09 is a Thursday
    const start = getWeekStart(new Date("2026-07-09T00:00:00"));
    expect(start.getDate()).toBe(6);
  });
});

describe("getWeekDays", () => {
  it("returns 7 consecutive days starting at weekStart", () => {
    const start = getWeekStart(new Date("2026-07-08T00:00:00"));
    const days = getWeekDays(start);
    expect(days).toHaveLength(7);
    expect(days.map(d => d.getDate())).toEqual([6, 7, 8, 9, 10, 11, 12]);
    expect(days[6].getDay()).toBe(0); // last day is Sunday
  });
});

describe("isSameDay", () => {
  it("matches dates on the same calendar day regardless of time", () => {
    expect(isSameDay(new Date("2026-07-06T01:00:00"), new Date("2026-07-06T23:00:00"))).toBe(true);
  });

  it("does not match different days", () => {
    expect(isSameDay(new Date("2026-07-06T23:59:00"), new Date("2026-07-07T00:01:00"))).toBe(false);
  });
});
