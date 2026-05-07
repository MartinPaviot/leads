/**
 * Identification dedup window (P0-2 task 2.2).
 *
 * If a visit's IP would resolve to a company we already identified
 * for this tenant within the last N days, reuse the prior result
 * instead of paying the provider again. Two ways the dedup hits :
 *
 *   1. Same exact IP → same hash → previously identified.
 *      Highest-confidence reuse, and the LLM-friendly story
 *      ("Acme Corp came back").
 *   2. Same /24 subnet → same office, even if the user's home
 *      router rebooted and assigned a new IP. Catches the "two
 *      visits same morning, same office" case while keeping
 *      false-positive risk low (companies rarely share a /24).
 *
 * Pure functions where we can. The DB lookup is wrapped behind a
 * pluggable `deps.findRecentIdentification` so tests stub it.
 *
 * Privacy : we hash IPs with SHA-256 before storing — the dedup
 * helper compares hashes, never raw IPs.
 */

import { createHash } from "node:crypto";

export interface DedupCandidate {
  /** SHA-256(raw IP). Stored on `visits.ipHash`. */
  ipHash: string;
  /** SHA-256("/24 subnet" of raw IP). Optional — stored separately
   *  on opt-in tenants ; passed null for tenants without it. */
  subnetHash: string | null;
}

export interface PriorIdentification {
  companyDomain: string;
  companyId: string;
  identifiedAt: Date;
  /** Which match strategy hit. */
  matchedBy: "ip_hash" | "subnet_hash";
}

const DEFAULT_WINDOW_DAYS = 7;
const MAX_WINDOW_DAYS = 90;
const MIN_WINDOW_DAYS = 1;

export function resolveDedupWindowDays(
  settings: Record<string, unknown> | null | undefined,
): number {
  if (!settings || typeof settings !== "object") return DEFAULT_WINDOW_DAYS;
  const raw = (settings as Record<string, unknown>).visitorIdDedupWindowDays;
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return DEFAULT_WINDOW_DAYS;
  }
  if (raw < MIN_WINDOW_DAYS) return MIN_WINDOW_DAYS;
  if (raw > MAX_WINDOW_DAYS) return MAX_WINDOW_DAYS;
  return Math.floor(raw);
}

/**
 * Compute the cutoff timestamp for the dedup window. The DB query
 * filters `identified_at >= cutoff`.
 */
export function dedupCutoff(now: Date, windowDays: number): Date {
  return new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
}

/**
 * Hash a raw IP via SHA-256, lowercase hex. Pure ; used by the
 * pixel endpoint AND the worker so the same hash lands in both
 * code paths.
 */
export function hashIp(rawIp: string): string {
  return createHash("sha256").update(rawIp.trim()).digest("hex");
}

/**
 * Hash the /24 subnet of an IPv4 raw IP. Returns null for IPv6 or
 * malformed input — the caller's pixel endpoint stores
 * `subnetHash = null` in that case and dedup falls back to IP-only.
 */
export function hashSubnet(rawIp: string): string | null {
  const trimmed = rawIp.trim();
  // Quick reject for obvious non-v4 (colons in IPv6).
  if (trimmed.includes(":")) return null;
  const parts = trimmed.split(".");
  if (parts.length !== 4) return null;
  for (const p of parts) {
    const n = Number(p);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
  }
  const subnet = `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
  return createHash("sha256").update(subnet).digest("hex");
}

/**
 * Decision shape returned by the dedup checker. When `cached` is
 * present, the caller skips the provider call and reuses the
 * prior identification. When null, proceed normally.
 */
export interface DedupDecision {
  cached: PriorIdentification | null;
  windowDays: number;
}

export interface DedupDeps {
  /** Look up the most-recent prior identification for this tenant
   *  whose ipHash OR subnetHash matches the candidate AND
   *  identifiedAt >= cutoff. Returns null when no hit. */
  findRecentIdentification: (args: {
    tenantId: string;
    candidate: DedupCandidate;
    cutoff: Date;
  }) => Promise<PriorIdentification | null>;
  loadTenantSettings: (
    tenantId: string,
  ) => Promise<Record<string, unknown> | null>;
}

export async function checkDedup(args: {
  tenantId: string;
  candidate: DedupCandidate;
  now?: Date;
  deps: DedupDeps;
}): Promise<DedupDecision> {
  const now = args.now ?? new Date();
  const settings = await args.deps.loadTenantSettings(args.tenantId);
  const windowDays = resolveDedupWindowDays(settings);
  const cutoff = dedupCutoff(now, windowDays);
  const cached = await args.deps.findRecentIdentification({
    tenantId: args.tenantId,
    candidate: args.candidate,
    cutoff,
  });
  return { cached, windowDays };
}
