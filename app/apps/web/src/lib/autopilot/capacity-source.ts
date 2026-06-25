/**
 * Spec 37 (B2.1) — warmup-aware sendable capacity for a tenant's MANAGED sending
 * pool. Elevay operates the sending infrastructure (Instantly mailboxes) ON BEHALF
 * of the client — the client never connects its own account, so auth is provider-
 * managed, not the tenant's DNS problem.
 *
 * This reads `connected_mailboxes`, maps each row to the pure `SendingMailbox`
 * shape, resolves auth (provider-managed by default), and DELEGATES the ramp/cap
 * math to `getSendableCapacity` (capacity.ts) — no warmup/cap math re-implemented.
 *
 * Blast radius: lib/autopilot/* only.
 */

import { db as defaultDb } from "@/db";
import { connectedMailboxes } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import {
  getSendableCapacity,
  type SendingMailbox,
  type CapacityReport,
} from "@/lib/sending/identity/capacity";
import type { AuthStatus } from "@/lib/sending/identity/auth";

/**
 * Providers whose authentication (SPF/DKIM/DMARC or OAuth) is managed for us, so a
 * mailbox on them is sendable without a per-domain DNS proof: Instantly (Elevay's
 * managed pool), Gmail/Google + Outlook/Microsoft (OAuth-authenticated). A
 * self-managed `smtp_custom` domain is NOT trusted until DNS-verified (follow-up).
 */
export const MANAGED_AUTH_PROVIDERS = new Set(["instantly", "gmail", "google", "outlook", "microsoft"]);

/** Mailbox statuses that can still send (warming ramps, active is full). */
const SENDABLE_STATUSES = ["warming_up", "active"] as const;

/**
 * Default auth resolution for the managed infrastructure: a provider-managed domain
 * is sendable; everything else needs explicit DNS verification (not wired → not
 * sendable). Injectable so a real `verifyDomainAuth` pass can replace it later.
 */
export function managedAuthByDomain(mailboxes: { domain: string; provider: string }[]): Map<string, AuthStatus> {
  const map = new Map<string, AuthStatus>();
  for (const mb of mailboxes) {
    if (map.has(mb.domain)) continue;
    const sendable = MANAGED_AUTH_PROVIDERS.has(mb.provider.toLowerCase());
    map.set(mb.domain, {
      domain: mb.domain,
      spf: sendable,
      dkim: sendable,
      dmarc: sendable,
      sendable,
      failures: sendable ? [] : ["unverified-self-managed-domain"],
    });
  }
  return map;
}

export interface CapacitySourceDeps {
  database?: typeof defaultDb;
  /** Override auth resolution (e.g. a real DNS-verify pass). Defaults to provider-managed. */
  resolveAuth?: (mailboxes: { domain: string; provider: string }[]) => Map<string, AuthStatus>;
}

/** B2.1 — the tenant's warmup-aware sendable capacity today, over its managed pool. */
export async function loadTenantCapacity(tenantId: string, deps: CapacitySourceDeps = {}): Promise<CapacityReport> {
  const database = deps.database ?? defaultDb;
  const resolveAuth = deps.resolveAuth ?? managedAuthByDomain;

  const rows = await database
    .select({
      id: connectedMailboxes.id,
      domain: connectedMailboxes.domain,
      provider: connectedMailboxes.provider,
      dailyLimit: connectedMailboxes.dailyLimit,
      warmupStartedAt: connectedMailboxes.warmupStartedAt,
      sentToday: connectedMailboxes.sentToday,
    })
    .from(connectedMailboxes)
    .where(and(eq(connectedMailboxes.tenantId, tenantId), inArray(connectedMailboxes.status, [...SENDABLE_STATUSES])));

  const mailboxes: SendingMailbox[] = rows.map((r) => ({
    id: r.id,
    domain: r.domain,
    provider: r.provider,
    dailyCap: r.dailyLimit ?? 50,
    warmupStartedAt: r.warmupStartedAt ?? null,
    sentToday: r.sentToday ?? 0,
  }));

  return getSendableCapacity(mailboxes, resolveAuth(mailboxes));
}
