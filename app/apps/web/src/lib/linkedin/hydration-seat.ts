/**
 * Pure helpers shared by the on-demand route (POST /api/linkedin/hydrate-accounts)
 * and the daily cron (inngest/linkedin-account-hydration-cron) — seat selection
 * + batch-size clamping. Kept in lib so both app and inngest depend on lib (never
 * app → inngest), and the logic stays unit-testable without the DB/auth.
 */

export interface HydrationSeatRow {
  status: string | null;
  unipileAccountId: string | null;
  seatType: string | null;
  userId: string | null;
}

/** Clamp the requested batch size to a safe range (protects the seat's ~100
 * profile-view/day quota — each company costs ~1-2 views). Default 25. */
export function clampHydrationLimit(n: unknown): number {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v) || v <= 0) return 25;
  return Math.min(50, Math.max(1, v));
}

/**
 * Pick the seat to hydrate from: the caller's own connected seat first, else any
 * connected seat in the tenant. Only Sales-Navigator / Recruiter seats are
 * eligible — company search + the headcount-growth `insights` are premium-tier
 * features, so a classic seat would just 422 every lookup. Pass userId="" (e.g.
 * from a cron, where there is no caller) to always take "any eligible seat".
 */
export function pickHydrationSeat(rows: HydrationSeatRow[], userId: string): HydrationSeatRow | null {
  const eligible = (r: HydrationSeatRow): boolean =>
    r.status === "connected" && !!r.unipileAccountId && (r.seatType === "sales_navigator" || r.seatType === "recruiter");
  return rows.find((r) => eligible(r) && r.userId === userId) ?? rows.find(eligible) ?? null;
}

/**
 * Pure: group connected-seat rows by tenant and pick one eligible (SN/Recruiter)
 * seat per tenant — the cron's selection. Each tenant is hydrated with ITS OWN
 * seat (no cross-tenant), and tenants with only classic/disconnected seats drop
 * out. Returns [tenantId, unipileAccountId] pairs.
 */
export function selectSeatsPerTenant(
  rows: Array<HydrationSeatRow & { tenantId: string }>,
): Array<[string, string]> {
  const grouped = new Map<string, Array<HydrationSeatRow & { tenantId: string }>>();
  for (const r of rows) grouped.set(r.tenantId, [...(grouped.get(r.tenantId) ?? []), r]);
  const out: Array<[string, string]> = [];
  for (const [tenantId, tenantRows] of grouped) {
    // No caller in a cron → userId "" never matches, so this takes any eligible seat.
    const seat = pickHydrationSeat(tenantRows, "");
    if (seat?.unipileAccountId) out.push([tenantId, seat.unipileAccountId]);
  }
  return out;
}
