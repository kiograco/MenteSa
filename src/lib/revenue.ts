export type MonthBucket = { key: string; label: string };

export function getLastMonths(count: number, referenceDate: Date = new Date()): MonthBucket[] {
  return Array.from({ length: count }).map((_, i) => {
    const d = new Date(referenceDate);
    d.setDate(1);
    d.setMonth(d.getMonth() - (count - 1 - i));
    return { key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString("pt-BR", { month: "short" }) };
  });
}

/** Sums `amount` per month bucket, keyed by each entry's `dateIso`. Entries outside the window are ignored. */
export function bucketAmountsByMonth(
  entries: { amount: number; dateIso: string }[],
  months: MonthBucket[]
): { month: string; total: number }[] {
  const totals = new Map(months.map(m => [m.key, 0]));

  entries.forEach(entry => {
    const d = new Date(entry.dateIso);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (totals.has(key)) totals.set(key, (totals.get(key) ?? 0) + entry.amount);
  });

  return months.map(m => ({ month: m.label, total: totals.get(m.key) ?? 0 }));
}
