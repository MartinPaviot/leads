/**
 * Spec 36 (T7) — the wiring that drives a LinkedIn step through the spec-24
 * orchestration with the live provider. Composition over tested parts:
 *   seat health/capacity gate (T5) → port factory (T7) → durable store (T7)
 *   → runLinkedInAction (spec 24).
 *
 * Fail-closed: a non-connected seat or an unconfigured provider refuses before
 * any spend. The warmup ramp (T5) is made authoritative by passing the
 * effective daily caps into runLinkedInAction's own limit gate. `resolveTarget`
 * (profileUrl → provider_id, the T1 step) is injected so this stays decoupled
 * from the live resolver. Server-only (DB + network).
 */

import type { LinkedInContact, LinkedInRequest, LinkedInActionType } from "./port";
import type { LinkedInOutcome, MeterOp } from "./linkedin";
import { runLinkedInAction } from "./linkedin";
import { buildLinkedInPort } from "./factory";
import { makeLinkedInPersistence } from "./db-store";
import { effectiveDailyCap, type LinkedInSendingAccount, type LinkedInAccountStatus } from "./capacity";
import { isLinkedInTargetAllowed } from "./recipient-guardrail";
import type { TargetResolver } from "@/lib/providers/unipile/linkedin-adapter";
import type { HeyReachClient } from "@/lib/providers/heyreach/linkedin-adapter";

export interface DispatchSeat {
  /** linkedin_account.id (durable). */
  id: string;
  /** Unipile account_id; the API target. Null until connected. */
  unipileAccountId: string | null;
  status: LinkedInAccountStatus;
  dailyCapConnect: number;
  dailyCapMessage: number;
  warmupStartedAt: Date | null;
}

export interface DispatchLinkedInParams {
  tenantId: string;
  seat: DispatchSeat;
  step: { id: string; action: LinkedInActionType; note?: string; message?: string };
  contact: LinkedInContact;
  /** profileUrl → provider_id (+ chat/degree), viewer-scoped (T1). */
  resolveTarget: TargetResolver;
  isSuppressed: (c: LinkedInContact) => boolean;
  isCollisionLocked: (c: LinkedInContact) => boolean;
  meter?: <R>(op: MeterOp, fn: () => Promise<R>) => Promise<R>;
  heyReachClient?: HeyReachClient;
  campaignId?: string;
  now?: () => number;
}

export type DispatchRefusal = "not-connected" | "provider-unavailable";

export type DispatchLinkedInResult = LinkedInOutcome | { acted: false; refusedReason: DispatchRefusal };

function seatToAccount(seat: DispatchSeat): LinkedInSendingAccount {
  return {
    id: seat.id,
    status: seat.status,
    dailyCapConnect: seat.dailyCapConnect,
    dailyCapMessage: seat.dailyCapMessage,
    warmupStartedAt: seat.warmupStartedAt,
  };
}

export async function dispatchLinkedInAction(p: DispatchLinkedInParams): Promise<DispatchLinkedInResult> {
  const now = p.now ?? (() => Date.now());

  // Fail-closed health gate (T5) — never dispatch from a non-connected seat.
  if (p.seat.status !== "connected" || !p.seat.unipileAccountId) {
    return { acted: false, refusedReason: "not-connected" };
  }

  const port = buildLinkedInPort({ resolveTarget: p.resolveTarget, heyReachClient: p.heyReachClient, campaignId: p.campaignId });
  if (!port) return { acted: false, refusedReason: "provider-unavailable" };

  const persistence = makeLinkedInPersistence({
    tenantId: p.tenantId,
    linkedinAccountId: p.seat.id,
    stepId: p.step.id,
    contactId: p.contact.id,
    now,
  });

  // The warmup ramp is authoritative: pass the effective caps into the
  // orchestration's own daily-limit gate (linkedin.ts withinDailyLimit).
  const acct = seatToAccount(p.seat);
  const limits = {
    connect: effectiveDailyCap(acct, "connect", now()),
    message: effectiveDailyCap(acct, "message", now()),
  };

  const req: LinkedInRequest = {
    stepId: p.step.id,
    action: p.step.action,
    contact: p.contact,
    senderAccountId: p.seat.unipileAccountId, // the Unipile account_id the API needs
    note: p.step.note,
    message: p.step.message,
    idempotencyKey: `${p.step.id}:${p.contact.id}`,
  };

  return runLinkedInAction(req, {
    port,
    isSuppressed: p.isSuppressed,
    isCollisionLocked: p.isCollisionLocked,
    // Defence-in-depth test-mode guardrail — holds no matter the trigger.
    isAllowedTarget: (c) => isLinkedInTargetAllowed(c.profileUrl),
    actionsToday: persistence.actionsToday,
    idempotency: persistence.idempotency,
    meter: p.meter ?? ((_op, fn) => fn()),
    limits,
    tenantId: p.tenantId,
    now,
  });
}
