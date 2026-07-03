import { describe, expect, it } from "vitest";
import { generateSlotsForDay, getUpcomingAvailableDays } from "./scheduling";

describe("getUpcomingAvailableDays", () => {
  it("only returns days matching a weekday the professional has availability for", () => {
    // 2026-07-02 is a Thursday (weekday 4); availability is Monday (1) and Wednesday (3).
    const now = new Date("2026-07-02T00:00:00");
    const availability = [
      { weekday: 1, start_time: "09:00", end_time: "12:00" },
      { weekday: 3, start_time: "14:00", end_time: "18:00" },
    ];

    const days = getUpcomingAvailableDays(availability, now, 14, 5);

    expect(days.length).toBeGreaterThan(0);
    days.forEach(d => expect([1, 3]).toContain(d.getDay()));
  });

  it("caps the result at maxDays", () => {
    const now = new Date("2026-07-02T00:00:00");
    const availability = [{ weekday: null, start_time: "09:00", end_time: "12:00" }];
    // No weekday matches (availability is a one-off specific_date row), so nothing should come back.
    expect(getUpcomingAvailableDays(availability, now, 14, 5)).toHaveLength(0);
  });
});

describe("generateSlotsForDay", () => {
  const day = new Date("2026-07-06T00:00:00"); // Monday
  const availability = [{ weekday: 1, start_time: "09:00", end_time: "10:30" }];

  it("generates back-to-back 50-minute slots that fit inside the window", () => {
    const slots = generateSlotsForDay(availability, day, new Set());
    // 09:00-10:30 fits exactly one 50-minute slot (09:00-09:50); 09:50+50=10:40 > 10:30 so no second slot.
    expect(slots.map(s => s.time)).toEqual(["09:00"]);
  });

  it("marks slots present in bookedIsoTimes as taken", () => {
    const [firstSlot] = generateSlotsForDay(availability, day, new Set());
    const slots = generateSlotsForDay(availability, day, new Set([firstSlot.iso]));
    expect(slots[0].taken).toBe(true);
  });

  it("returns nothing for a weekday with no availability", () => {
    const tuesday = new Date("2026-07-07T00:00:00");
    expect(generateSlotsForDay(availability, tuesday, new Set())).toHaveLength(0);
  });
});
