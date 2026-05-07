/**
 * Add N days to a date, skipping Saturday (6) and Sunday (0).
 *
 * `days = 0` returns the same instant. Negative values move backwards
 * (still skipping weekends). Time-of-day is preserved.
 */
export function addBusinessDays(date: Date, days: number): Date {
  if (days === 0) return new Date(date.getTime());
  const out = new Date(date.getTime());
  const direction = days > 0 ? 1 : -1;
  let remaining = Math.abs(days);
  while (remaining > 0) {
    out.setUTCDate(out.getUTCDate() + direction);
    const dow = out.getUTCDay();
    if (dow !== 0 && dow !== 6) remaining--;
  }
  return out;
}

/** Roll a date forward to the next business day if it falls on a weekend. */
export function rollToBusinessDay(date: Date): Date {
  const dow = date.getUTCDay();
  // `addBusinessDays(_, 1)` skips weekend days entirely, so from Sat or
  // Sun the +1 business day always lands on the following Monday.
  if (dow === 0 || dow === 6) return addBusinessDays(date, 1);
  return new Date(date.getTime());
}
