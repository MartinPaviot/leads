/**
 * Spec 22 — suppression list. The compliance/deliverability safety check run
 * before any enrollment or send: we never contact someone who opted out,
 * hard-bounced, or is on a do-not-contact / competitor / existing-customer list.
 * Correctness beats cleverness; the lookup is O(1) for the send hot path.
 *
 * Distinct from lib/accounts/suppression.ts, which suppresses ACCOUNTS during
 * sourcing (deleted/excluded). This stores + enforces only; opt-out detection
 * (26) and bounce detection (27) feed it. Blast radius: suppression/* only.
 */

export type SuppressionType =
  | "opt_out"
  | "hard_bounce"
  | "manual_dnc"
  | "competitor"
  | "existing_customer"
  | "complaint"; // spec 35 — spam complaint; permanent like opt_out

// 'account' (spec 35) suppresses a whole company; its `value` is the company's
// canonical identity_key (survives re-import / TAM rebuild), not a domain.
export type SuppressionLevel = "address" | "domain" | "account";

/** "global" or a tenantId. */
export const GLOBAL_SCOPE = "global";

export interface SuppressionEntry {
  scope: string;
  level: SuppressionLevel;
  /** Normalized email (address) or domain. */
  value: string;
  type: SuppressionType;
  reason?: string;
  /** Permanent entries never expire (opt-outs always). */
  permanent: boolean;
  createdAt: number;
  /** Cool-off expiry for non-permanent (bounce) entries. */
  expiresAt?: number;
}

export interface SuppressionStore {
  get(key: string): SuppressionEntry | undefined;
  put(key: string, entry: SuppressionEntry): void;
}

// ── normalization (mirrors lib/accounts/suppression, no @/db coupling) ──

export function normalizeEmail(email?: string | null): string | null {
  if (!email) return null;
  const e = email.trim().toLowerCase();
  return e.length > 0 ? e : null;
}

export function normalizeDomain(domain?: string | null): string | null {
  if (!domain) return null;
  const d = domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/^@/, "")
    .replace(/\/.*$/, "");
  return d.length > 0 ? d : null;
}

export function domainOfEmail(email?: string | null): string | null {
  const e = normalizeEmail(email);
  if (!e) return null;
  const at = e.lastIndexOf("@");
  return at >= 0 ? normalizeDomain(e.slice(at + 1)) : null;
}

export function suppressionKey(scope: string, level: SuppressionLevel, value: string): string {
  return `${scope}:${level}:${value}`;
}

// ── ingestion (AC3) ──

export interface OptOutEvent {
  email: string;
  tenantId?: string;
  reason?: string;
  /** Opt-outs that apply to every workspace (rare). Default workspace-scoped. */
  global?: boolean;
}

/** AC3 — an opt-out is PERMANENT, address-level. */
export function suppressionFromOptOut(e: OptOutEvent, now: number = Date.now()): SuppressionEntry {
  return {
    scope: e.global ? GLOBAL_SCOPE : (e.tenantId ?? GLOBAL_SCOPE),
    level: "address",
    value: normalizeEmail(e.email) ?? "",
    type: "opt_out",
    reason: e.reason,
    permanent: true,
    createdAt: now,
  };
}

export interface BouncePolicy {
  /** Hard bounce permanently suppresses (default true). */
  permanent?: boolean;
  /** When not permanent, the cool-off window before it lifts. */
  coolOffMs?: number;
}

/** AC3 — a hard bounce suppresses the address, permanently or with a cool-off per policy. */
export function suppressionFromBounce(
  e: { email: string; tenantId?: string; reason?: string },
  policy: BouncePolicy = {},
  now: number = Date.now(),
): SuppressionEntry {
  const permanent = policy.permanent ?? true;
  return {
    scope: e.tenantId ?? GLOBAL_SCOPE,
    level: "address",
    value: normalizeEmail(e.email) ?? "",
    type: "hard_bounce",
    reason: e.reason,
    permanent,
    createdAt: now,
    expiresAt: permanent ? undefined : now + (policy.coolOffMs ?? 0),
  };
}

// ── add (AC5 idempotent) ──

/**
 * Idempotent on (scope, level, value): re-adding merges to the STRONGER entry —
 * permanent wins, the earliest createdAt is kept, and a permanent merge clears
 * any cool-off. Returns the stored entry.
 */
export function addSuppression(store: SuppressionStore, entry: SuppressionEntry): SuppressionEntry {
  const value = entry.level === "domain" ? normalizeDomain(entry.value) : normalizeEmail(entry.value);
  if (!value) throw new Error("suppression: empty value");
  const normalized: SuppressionEntry = { ...entry, value };
  const key = suppressionKey(normalized.scope, normalized.level, value);

  const existing = store.get(key);
  if (existing) {
    const permanent = existing.permanent || normalized.permanent;
    const merged: SuppressionEntry = {
      ...existing,
      ...normalized,
      permanent,
      createdAt: Math.min(existing.createdAt, normalized.createdAt),
      expiresAt: permanent ? undefined : Math.max(existing.expiresAt ?? 0, normalized.expiresAt ?? 0) || undefined,
    };
    store.put(key, merged);
    return merged;
  }
  store.put(key, normalized);
  return normalized;
}

// ── check (AC2 hot path, O(1)) ──

export interface SuppressionTarget {
  email?: string | null;
  domain?: string | null;
  /** Spec 35 — the contact's company canonical identity_key, for account-scope. */
  accountKey?: string | null;
  tenantId?: string;
}

export interface SuppressionHit {
  entry: SuppressionEntry;
  matchedKey: string;
}

function liveAt(entry: SuppressionEntry | undefined, now: number): SuppressionEntry | undefined {
  if (!entry) return undefined;
  if (entry.permanent) return entry;
  if (entry.expiresAt !== undefined && entry.expiresAt <= now) return undefined; // cooled off
  return entry;
}

/**
 * AC2/AC5 — is this target suppressed? Checks address (global + workspace) then
 * domain (global + workspace) with a constant number of O(1) lookups. Returns
 * the first live hit, else null. An expired cool-off entry does not suppress.
 */
export function isSuppressed(
  target: SuppressionTarget,
  store: SuppressionStore,
  now: number = Date.now(),
): SuppressionHit | null {
  const email = normalizeEmail(target.email);
  const domain = normalizeDomain(target.domain) ?? domainOfEmail(target.email);
  const accountKey = target.accountKey?.trim() || null;
  const scopes = target.tenantId ? [GLOBAL_SCOPE, target.tenantId] : [GLOBAL_SCOPE];

  const candidates: Array<[SuppressionLevel, string]> = [];
  if (email) candidates.push(["address", email]);
  if (domain) candidates.push(["domain", domain]);
  // Account-scope (spec 35): value is the company identity_key, used verbatim.
  if (accountKey) candidates.push(["account", accountKey]);

  for (const [level, value] of candidates) {
    for (const scope of scopes) {
      const key = suppressionKey(scope, level, value);
      const hit = liveAt(store.get(key), now);
      if (hit) return { entry: hit, matchedKey: key };
    }
  }
  return null;
}

/** Boolean convenience for guard clauses. */
export function suppressed(target: SuppressionTarget, store: SuppressionStore, now?: number): boolean {
  return isSuppressed(target, store, now) !== null;
}

/** Map-backed O(1) store for tests + single-process dev / send-hot-path cache. */
export class InMemorySuppressionStore implements SuppressionStore {
  private readonly map = new Map<string, SuppressionEntry>();
  get(key: string): SuppressionEntry | undefined {
    return this.map.get(key);
  }
  put(key: string, entry: SuppressionEntry): void {
    this.map.set(key, entry);
  }
  get size(): number {
    return this.map.size;
  }
}
