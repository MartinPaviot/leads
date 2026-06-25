/**
 * Spec 21 — ADMIN-triggered warmup control (NOT auto). Warmup is enabled by an
 * Elevay operator (the admin console, gated by ADMIN_SECRET) FOR a client tenant —
 * never automatically on connect. This is the pure cross-tenant orchestration:
 * resolve the target tenant's Instantly key, list its mailboxes, enable/disable
 * warmup. The operator-auth gate + the decrypt/list/setWarmup wiring are injected,
 * so this stays pure and unit-testable, and the dangerous bits (a decrypted key,
 * cross-tenant access) live behind the caller.
 *
 * SECURITY: a requested email subset is intersected with the resolved tenant's OWN
 * listed mailboxes, so a crafted request can never toggle warmup on an address
 * outside that tenant's Instantly workspace.
 *
 * Blast radius: sending/identity/* only.
 */

export type WarmupAction = "enable" | "disable";

export interface TenantWarmupDeps {
  /** Decrypt + return the tenant's Instantly API key, or null if Instantly isn't connected. */
  resolveKey: (tenantId: string) => Promise<string | null>;
  /** List the tenant's Instantly mailbox accounts (raw objects incl. email + warmup fields). */
  listAccounts: (apiKey: string) => Promise<{ ok: boolean; accounts: Record<string, unknown>[]; errorMessage?: string }>;
  /** Enable/disable warmup for the given emails; returns the async job id. */
  setWarmup: (apiKey: string, emails: string[], action: WarmupAction) => Promise<{ ok: boolean; jobId?: string; errorMessage?: string }>;
}

export interface TenantWarmupResult {
  ok: boolean;
  action: WarmupAction;
  /** How many mailboxes the action was applied to. */
  mailboxes: number;
  /** The Instantly background-job id to poll, on success. */
  jobId?: string;
  /** Failure reason when ok is false. */
  reason?:
    | "instantly_not_connected"
    | "list_accounts_failed"
    | "no_mailboxes"
    | "no_matching_mailboxes"
    | "warmup_call_failed";
}

const emailOf = (a: Record<string, unknown>): string => (typeof a.email === "string" ? a.email.trim() : "");

/**
 * Enable or disable Instantly warmup for ALL of a tenant's mailboxes (or a subset
 * via opts.emails — always intersected with the tenant's own listed mailboxes).
 * Pure given injected deps. Never throws — returns a typed result.
 */
export async function setTenantWarmup(
  tenantId: string,
  action: WarmupAction,
  deps: TenantWarmupDeps,
  opts: { emails?: string[] } = {},
): Promise<TenantWarmupResult> {
  const key = await deps.resolveKey(tenantId);
  if (!key) return { ok: false, action, mailboxes: 0, reason: "instantly_not_connected" };

  const listed = await deps.listAccounts(key);
  if (!listed.ok) return { ok: false, action, mailboxes: 0, reason: "list_accounts_failed" };

  const own = listed.accounts.map(emailOf).filter(Boolean);
  if (own.length === 0) return { ok: false, action, mailboxes: 0, reason: "no_mailboxes" };

  let emails = own;
  if (opts.emails) {
    // SECURITY: only ever act on the tenant's OWN mailboxes, never an arbitrary address.
    const requested = new Set(opts.emails.map((e) => e.trim().toLowerCase()));
    emails = own.filter((e) => requested.has(e.toLowerCase()));
    if (emails.length === 0) return { ok: false, action, mailboxes: 0, reason: "no_matching_mailboxes" };
  }

  const res = await deps.setWarmup(key, emails, action);
  return res.ok
    ? { ok: true, action, mailboxes: emails.length, jobId: res.jobId }
    : { ok: false, action, mailboxes: emails.length, reason: "warmup_call_failed" };
}

export interface MailboxWarmup {
  email: string;
  /** Instantly warmup_status (1=active/-1=banned/-2=spam/-3=suspended/0=paused), or null. */
  warmupStatus: number | null;
  /** Instantly stat_warmup_score (0-100), or null. */
  warmupScore: number | null;
}

/** Map listed Instantly accounts → per-mailbox warmup status/score for the admin overview. */
export function mailboxWarmupOverview(accounts: Record<string, unknown>[]): MailboxWarmup[] {
  return accounts
    .map((a) => ({
      email: emailOf(a),
      warmupStatus: typeof a.warmup_status === "number" ? a.warmup_status : null,
      warmupScore: typeof a.stat_warmup_score === "number" ? a.stat_warmup_score : null,
    }))
    .filter((m) => m.email);
}
