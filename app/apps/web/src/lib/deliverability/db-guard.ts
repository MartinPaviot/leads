/**
 * Spec 27 — DB-backed deliverability guard. Sources send/bounce/complaint/reply
 * events from outbound_emails, runs the pure guard (./guard) to decide pause /
 * resume, and persists the per-scope GuardState. The conductor's isGuardTripped
 * port reads this (and any send path can). Absent state = active = no-op, so a
 * healthy tenant is never blocked.
 *
 * Scope is the tenantId for this first slice (a tenant's overall sending health);
 * the column is forward-compatible with a per-domain scope later.
 */

import { db as defaultDb } from "@/db";
import { outboundEmails, deliverabilityGuardState } from "@/db/schema";
import { and, eq, gte, or } from "drizzle-orm";
import {
  computeHealth,
  shouldPause,
  pause,
  resumeIfRecovered,
  activeState,
  type DeliverabilityEvent,
  type GuardState,
} from "./guard";

const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function ms(d: Date | string | null | undefined): number | null {
  if (d == null) return null;
  const t = d instanceof Date ? d.getTime() : new Date(d).getTime();
  return Number.isFinite(t) ? t : null;
}

interface OutRow {
  sentAt: Date | string | null;
  bouncedAt: Date | string | null;
  bounceType: string | null;
  toAddress: string;
  repliedAt: Date | string | null;
}

/** Map a tenant's recent outbound rows to deliverability events (send + bounce/complaint + reply). */
export function rowsToEvents(rows: OutRow[]): DeliverabilityEvent[] {
  const events: DeliverabilityEvent[] = [];
  for (const r of rows) {
    const sent = ms(r.sentAt);
    if (sent != null) events.push({ type: "send", at: sent });
    const bounced = ms(r.bouncedAt);
    if (bounced != null) {
      // bounce_type carries TWO provider vocabularies: Resend writes
      // "permanent"/"temporary"/"complaint" (resend/route.ts:139,176); EmailEngine
      // writes "hard"/"soft" (emailengine/route.ts:150) and never "complaint".
      // Recognize BOTH hard spellings so a hard bounce is classified hard whoever
      // wrote it — else hardBounceAddresses() under-reports EmailEngine bounces
      // (latent today: it's unwired + the EmailEngine webhook opt-outs hard bounces
      // directly, but this closes the footgun for when it's wired to spec-22).
      // NOTE: EmailEngine has no complaint signal (IMAP has no FBL), so spamRate is
      // structurally 0 on the owner-SMTP/IMAP path — the spam breach is inert there.
      if (r.bounceType === "complaint") events.push({ type: "complaint", at: bounced });
      else events.push({ type: "bounce", at: bounced, hard: r.bounceType === "permanent" || r.bounceType === "hard", address: r.toAddress });
    }
    const replied = ms(r.repliedAt);
    if (replied != null) events.push({ type: "reply", at: replied });
  }
  return events;
}

/** Load the tenant's send/bounce events over the rolling window. */
export async function buildTenantEvents(tenantId: string, now: number, database: typeof defaultDb = defaultDb): Promise<DeliverabilityEvent[]> {
  const since = new Date(now - WINDOW_MS);
  const rows = await database
    .select({ sentAt: outboundEmails.sentAt, bouncedAt: outboundEmails.bouncedAt, bounceType: outboundEmails.bounceType, toAddress: outboundEmails.toAddress, repliedAt: outboundEmails.repliedAt })
    .from(outboundEmails)
    .where(and(eq(outboundEmails.tenantId, tenantId), or(gte(outboundEmails.sentAt, since), gte(outboundEmails.bouncedAt, since))));
  return rowsToEvents(rows as OutRow[]);
}

function rowToState(r: { scope: string; status: string; pausedAt: Date | string | null; pauseReason: string | null; rampLevel: number }): GuardState {
  return {
    scope: r.scope,
    status: r.status === "paused" ? "paused" : "active",
    pausedAt: ms(r.pausedAt) ?? undefined,
    pauseReason: r.pauseReason ?? undefined,
    rampLevel: r.rampLevel,
  };
}

export async function loadGuardState(scope: string, database: typeof defaultDb = defaultDb): Promise<GuardState | null> {
  const [r] = await database.select().from(deliverabilityGuardState).where(eq(deliverabilityGuardState.scope, scope)).limit(1);
  return r ? rowToState(r) : null;
}

export async function saveGuardState(tenantId: string | null, state: GuardState, database: typeof defaultDb = defaultDb): Promise<void> {
  const values = {
    scope: state.scope,
    tenantId,
    status: state.status,
    pausedAt: state.pausedAt ? new Date(state.pausedAt) : null,
    pauseReason: state.pauseReason ?? null,
    rampLevel: state.rampLevel,
    updatedAt: new Date(),
  };
  await database
    .insert(deliverabilityGuardState)
    .values(values)
    .onConflictDoUpdate({ target: deliverabilityGuardState.scope, set: { status: values.status, pausedAt: values.pausedAt, pauseReason: values.pauseReason, rampLevel: values.rampLevel, updatedAt: values.updatedAt } });
}

/**
 * Compute current health for a tenant, then pause (on breach) or resume (after
 * cool-off + recovery) and persist. Returns the resulting state. Idempotent: an
 * unchanged decision rewrites the same row. Never blocks below the min sample.
 */
export async function evaluateGuard(
  tenantId: string,
  opts: { provider?: string; now?: number; database?: typeof defaultDb } = {},
): Promise<GuardState> {
  const now = opts.now ?? Date.now();
  const provider = opts.provider ?? "default";
  const database = opts.database ?? defaultDb;
  const scope = tenantId;

  const events = await buildTenantEvents(tenantId, now, database);
  const health = computeHealth(scope, provider, events, { now });

  let state = (await loadGuardState(scope, database)) ?? activeState(scope);
  const before = state.status;
  if (state.status === "active") {
    if (shouldPause(health)) state = pause(state, health.breaches.join(","), now);
  } else {
    state = resumeIfRecovered(state, health, now);
  }
  // Persist only on a transition (avoid a write every tick for healthy tenants).
  if (state.status !== before || before === "paused") await saveGuardState(tenantId, state, database);
  return state;
}

/** True iff the tenant's sending is currently paused by the guard. Evaluates fresh. */
export async function guardTrippedForTenant(tenantId: string, opts?: { now?: number; database?: typeof defaultDb }): Promise<boolean> {
  return (await evaluateGuard(tenantId, opts)).status === "paused";
}
