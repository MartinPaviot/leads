/**
 * Spec 21 (AC1/AC3/AC4/AC5) — sending-identity registry + per-day capacity.
 * Wraps the existing warmup ramp (deliverability/warmup) so the methodology
 * schedule is reused, not restated. Capacity is a pure function of caps, warmup
 * state, auth status, and the day's sends so far — no path lets an
 * unauthenticated or over-cap mailbox report capacity.
 */

import { getWarmupDailyTarget, isWarmupComplete } from "@/lib/campaign-engine/deliverability/warmup";
import type { AuthStatus } from "./auth";

export type SendingProvider = "google" | "microsoft" | "smtp" | (string & {});

export interface SendingMailbox {
  id: string;
  domain: string;
  provider: SendingProvider;
  /** Steady-state daily cap once warmed. */
  dailyCap: number;
  /** null = not in warmup (fully warmed or pre-launch). */
  warmupStartedAt: Date | null;
  /** Real sends already made today — INCLUDES warmup volume (AC4). */
  sentToday: number;
}

/** Methodology target: 2–3 mailboxes per domain. */
export const MAILBOXES_PER_DOMAIN = { min: 2, max: 3 } as const;

export interface IdentityRegistration {
  domain: string;
  mailboxes: SendingMailbox[];
  /** Within the 2–3-per-domain target. */
  withinTarget: boolean;
  warnings: string[];
}

/** AC1 — register a domain's mailboxes and validate the per-domain target. */
export function registerIdentity(domain: string, mailboxes: SendingMailbox[]): IdentityRegistration {
  const own = mailboxes.filter((m) => m.domain === domain);
  const warnings: string[] = [];
  if (own.length < MAILBOXES_PER_DOMAIN.min) warnings.push(`below-target:${own.length}<${MAILBOXES_PER_DOMAIN.min}`);
  if (own.length > MAILBOXES_PER_DOMAIN.max) warnings.push(`above-target:${own.length}>${MAILBOXES_PER_DOMAIN.max}`);
  return { domain, mailboxes: own, withinTarget: own.length >= MAILBOXES_PER_DOMAIN.min && own.length <= MAILBOXES_PER_DOMAIN.max, warnings };
}

/** True while the mailbox is still ramping. */
export function isWarming(mb: SendingMailbox): boolean {
  return mb.warmupStartedAt !== null && !isWarmupComplete(mb.warmupStartedAt);
}

/**
 * AC3/AC4 — the cap that applies today: the warmup ramp while warming (never
 * above the steady-state cap), else the steady cap. Warmup volume is already in
 * `sentToday`, so subtracting it from this cap keeps warmup inside the ceiling.
 */
export function effectiveDailyCap(mb: SendingMailbox): number {
  if (!mb.warmupStartedAt || isWarmupComplete(mb.warmupStartedAt)) return mb.dailyCap;
  return Math.min(getWarmupDailyTarget(mb.warmupStartedAt), mb.dailyCap);
}

export interface MailboxCapacity {
  mailboxId: string;
  domain: string;
  provider: SendingProvider;
  authSendable: boolean;
  warming: boolean;
  effectiveCap: number;
  sentToday: number;
  /** Remaining sends today: 0 unless the domain is authenticated. */
  available: number;
}

export interface CapacityReport {
  byMailbox: MailboxCapacity[];
  totalAvailable: number;
  /** AC5 — the mixed-provider pool: available capacity per provider. */
  byProvider: Record<string, number>;
}

/**
 * AC1/AC4/AC5 — sendable capacity for the day. A mailbox on an unauthenticated
 * domain reports 0; otherwise `max(0, effectiveCap - sentToday)`. Aggregated to
 * a total and a per-provider pool.
 */
export function getSendableCapacity(
  mailboxes: SendingMailbox[],
  authByDomain: Map<string, AuthStatus>,
): CapacityReport {
  const byMailbox: MailboxCapacity[] = mailboxes.map((mb) => {
    const authSendable = authByDomain.get(mb.domain)?.sendable === true;
    const effectiveCap = effectiveDailyCap(mb);
    const available = authSendable ? Math.max(0, effectiveCap - mb.sentToday) : 0;
    return { mailboxId: mb.id, domain: mb.domain, provider: mb.provider, authSendable, warming: isWarming(mb), effectiveCap, sentToday: mb.sentToday, available };
  });

  const byProvider: Record<string, number> = {};
  for (const m of byMailbox) byProvider[m.provider] = (byProvider[m.provider] ?? 0) + m.available;

  return { byMailbox, totalAvailable: byMailbox.reduce((s, m) => s + m.available, 0), byProvider };
}
