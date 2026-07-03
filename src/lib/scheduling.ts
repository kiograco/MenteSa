export type AvailabilitySlot = {
  weekday: number | null;
  start_time: string;
  end_time: string;
};

export type GeneratedSlot = {
  time: string;
  iso: string;
  taken: boolean;
};

/**
 * Returns the next calendar days (within `horizonDays`) that match a weekday the
 * professional has recurring availability for, capped at `maxDays`.
 */
export function getUpcomingAvailableDays(
  availability: AvailabilitySlot[],
  now: Date = new Date(),
  horizonDays = 14,
  maxDays = 5
): Date[] {
  const weekdays = new Set(availability.map(a => a.weekday));
  const days: Date[] = [];

  for (let i = 0; i < horizonDays && days.length < maxDays; i++) {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + i);
    if (weekdays.has(d.getDay())) days.push(d);
  }

  return days;
}

/**
 * Generates 50-minute session slots for a given day from the professional's recurring
 * availability windows, marking slots already present in `bookedIsoTimes` as taken.
 */
export function generateSlotsForDay(
  availability: AvailabilitySlot[],
  day: Date,
  bookedIsoTimes: Set<string>,
  sessionMinutes = 50
): GeneratedSlot[] {
  const dayAvailability = availability.filter(a => a.weekday === day.getDay());
  const slots: GeneratedSlot[] = [];

  dayAvailability.forEach(a => {
    const [startH, startM] = a.start_time.split(":").map(Number);
    const [endH, endM] = a.end_time.split(":").map(Number);
    let cursorMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    while (cursorMinutes + sessionMinutes <= endMinutes) {
      const slotDate = new Date(day);
      slotDate.setHours(Math.floor(cursorMinutes / 60), cursorMinutes % 60, 0, 0);
      const iso = slotDate.toISOString();
      slots.push({
        time: `${String(Math.floor(cursorMinutes / 60)).padStart(2, "0")}:${String(cursorMinutes % 60).padStart(2, "0")}`,
        iso,
        taken: bookedIsoTimes.has(iso),
      });
      cursorMinutes += sessionMinutes;
    }
  });

  return slots;
}
