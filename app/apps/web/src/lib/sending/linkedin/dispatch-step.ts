/**
 * Spec 36 (P0) — send a LinkedIn sequence step from the STEP OWNER's seat.
 * Composes the tested pieces: seat resolver (step -> owner -> seat) -> per-seat
 * provider_id resolver -> dispatchLinkedInAction (which fail-closes on health,
 * applies suppression-22 / anti-collision-14 / the test-mode guardrail / per-seat
 * warmup caps / idempotency). No pool fallback — a missing seat refuses, it never
 * borrows a teammate's login.
 *
 * This is the seam the sequence engine calls for a `linkedin` step (the
 * sequence-dispatch stub delegates here once a live seat exists — that flip + the
 * first live action is the remaining verification step).
 */

import type { LinkedInActionType, LinkedInContact } from "./port";
import type { MeterOp } from "./linkedin";
import { dispatchLinkedInAction, type DispatchLinkedInResult } from "./dispatch";
import { resolveLinkedInSeatForStep } from "./seat-resolver";
import { makeUnipileTargetResolver } from "@/lib/providers/unipile/resolve-target";
import { readUnipileConfig } from "@/lib/providers/unipile/http";

export interface DispatchLinkedInStepParams {
  tenantId: string;
  /** The sequence whose creator owns the send (sequences.createdBy). */
  sequenceId: string;
  step: { id: string; action: LinkedInActionType; note?: string; message?: string };
  contact: LinkedInContact;
  isSuppressed: (c: LinkedInContact) => boolean;
  isCollisionLocked: (c: LinkedInContact) => boolean;
  meter?: <R>(op: MeterOp, fn: () => Promise<R>) => Promise<R>;
  now?: () => number;
}

export type StepRefusal = "no-owner" | "no-connected-seat" | "provider-unavailable";

export type DispatchLinkedInStepResult = DispatchLinkedInResult | { acted: false; refusedReason: StepRefusal };

/**
 * Resolve the owner's seat and dispatch. A `no-owner`/`no-connected-seat`
 * refusal is the caller's cue to queue the step + notify (the owner to connect,
 * or the admin for an ownerless sequence) — never to fall back to another seat.
 */
export async function dispatchLinkedInStep(p: DispatchLinkedInStepParams): Promise<DispatchLinkedInStepResult> {
  const resolution = await resolveLinkedInSeatForStep(p.tenantId, p.sequenceId);
  if (!resolution.ok) return { acted: false, refusedReason: resolution.reason };

  const cfg = readUnipileConfig();
  if (!cfg) return { acted: false, refusedReason: "provider-unavailable" };

  const { seat } = resolution;
  const resolveTarget = makeUnipileTargetResolver({
    tenantId: p.tenantId,
    linkedinAccountId: seat.id,
    // ok=true guarantees a non-null unipileAccountId (classifySeatResolution).
    unipileAccountId: seat.unipileAccountId!,
    cfg,
  });

  return dispatchLinkedInAction({
    tenantId: p.tenantId,
    seat,
    step: p.step,
    contact: p.contact,
    resolveTarget,
    isSuppressed: p.isSuppressed,
    isCollisionLocked: p.isCollisionLocked,
    meter: p.meter,
    now: p.now,
  });
}
