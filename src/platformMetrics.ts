export function averagePerDay(
  total: number,
  first: number | null,
  now: number,
): number {
  if (!total || first === null) return 0;
  const day = (ms: number) => Math.floor((ms + 330 * 60000) / 86400000);
  return total / Math.max(1, day(now) - day(first) + 1);
}
