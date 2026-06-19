/**
 * POST /api/sequences/drafts/bulk-approve
 *
 * Atomic batch approve (B5, _specs/pilae-machine/spec-v2.md R7.4).
 *
 * Body : { ids: string[], scheduledSendAt?: ISO8601 }
 * Response (200) : { approved: string[], queuedAt: ISO8601 }
 * Response (404) : { error, missingIds: string[] }
 * Response (409) : { error, failures: Array<{id, reason}> }
 *
 * Atomicity contract: either ALL ids approve, or NONE do. The batch
 * fails fast on:
 *   - input validation (≤ 100 ids, all non-empty strings, deduped)
 *   - missing ids (returns 404 listing them — no cross-tenant leakage:
 *     a wrong-tenant id reads as "missing" because tenant scope is in
 *     the SELECT)
 *   - non-`pending_approval` state on any draft (409 with reasons)
 *   - version mismatch inside the tx (409 — a race lost)
 *
 * Best-effort post-success steps (enrollment advance, send-queue
 * emission) mirror the single-draft approve route — failures here
 * don't un-approve.
 */

import { getAuthContext } from "@/lib/auth/auth-utils";
import { requireCapabilityForRequest } from "@/lib/auth/permissions";
import { db } from "@/db";
import { sequenceDrafts, sequenceEnrollments, sequenceSteps } from "@/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  findMissingIds,
  validateBulkApprove,
  validateBulkInput,
} from "@/lib/sequence-drafts/bulk-approve";
import type { DraftStatus } from "@/lib/sequence-drafts/state-machine";
import { inngest } from "@/inngest/client";
import { logger } from "@/lib/observability/logger";

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // CLE-12 — unified matrix gate on the fresh DB role. Bulk-approving drafts
  // under /api/sequences requires sequences:write (member+).
  const denied = requireCapabilityForRequest(authCtx, req);
  if (denied) return denied;

  let body: { ids?: unknown; scheduledSendAt?: string } = {};
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const inputCheck = validateBulkInput(body.ids);
  if (!inputCheck.ok) {
    return Response.json({ error: inputCheck.error }, { status: 400 });
  }
  const ids = inputCheck.ids;

  let scheduledSendAt = new Date();
  if (body.scheduledSendAt) {
    const parsed = new Date(body.scheduledSendAt);
    if (Number.isNaN(parsed.getTime())) {
      return Response.json(
        { error: "Invalid scheduledSendAt" },
        { status: 400 },
      );
    }
    scheduledSendAt = parsed;
  }

  // 1. Load drafts (tenant-scoped). A row that doesn't belong to the
  //    tenant reads as missing — we never leak cross-tenant existence.
  const drafts = await db
    .select()
    .from(sequenceDrafts)
    .where(
      and(
        inArray(sequenceDrafts.id, ids),
        eq(sequenceDrafts.tenantId, authCtx.tenantId),
      ),
    );

  const missing = findMissingIds(ids, drafts);
  if (missing.length > 0) {
    return Response.json(
      {
        error: `${missing.length} draft(s) not found or not in this tenant`,
        missingIds: missing,
      },
      { status: 404 },
    );
  }

  // 2. State-machine check across the whole batch.
  const stateCheck = validateBulkApprove(
    drafts.map((d) => ({ id: d.id, status: d.status as DraftStatus })),
  );
  if (!stateCheck.ok) {
    return Response.json(
      {
        error: "One or more drafts cannot be approved in their current state",
        failures: stateCheck.failures,
      },
      { status: 409 },
    );
  }

  // 3. Atomic update — single transaction. If any version assertion
  //    fails, we throw and roll back the whole batch.
  const reviewedAt = new Date();
  let approvedIds: string[] = [];
  try {
    await db.transaction(async (tx) => {
      for (const draft of drafts) {
        const updated = await tx
          .update(sequenceDrafts)
          .set({
            status: "approved",
            scheduledSendAt,
            reviewedAt,
            reviewedBy: authCtx.userId,
            version: draft.version + 1,
            updatedAt: reviewedAt,
          })
          .where(
            and(
              eq(sequenceDrafts.id, draft.id),
              eq(sequenceDrafts.tenantId, authCtx.tenantId),
              eq(sequenceDrafts.version, draft.version),
            ),
          )
          .returning({ id: sequenceDrafts.id });
        if (updated.length === 0) {
          throw new Error(
            `Version mismatch on draft ${draft.id} — concurrent update detected`,
          );
        }
        approvedIds.push(draft.id);
      }
    });
  } catch (err) {
    return Response.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Transaction failed — batch rolled back",
        rolledBack: true,
      },
      { status: 409 },
    );
  }

  // 4. Best-effort enrollment advance per draft + send-queue emission.
  //    Failures here do NOT un-approve — mirrors the single-draft
  //    route's behaviour.
  for (const draft of drafts) {
    try {
      const [stepRow] = await db
        .select({
          delayDays: sequenceSteps.delayDays,
          sequenceId: sequenceSteps.sequenceId,
        })
        .from(sequenceSteps)
        .where(eq(sequenceSteps.id, draft.stepId))
        .limit(1);
      if (stepRow) {
        const delayMs = (stepRow.delayDays ?? 2) * 24 * 60 * 60 * 1000;
        const nextStepAt = new Date(scheduledSendAt.getTime() + delayMs);
        await db
          .update(sequenceEnrollments)
          .set({
            currentStep: sql`${sequenceEnrollments.currentStep} + 1` as never,
            lastStepAt: scheduledSendAt,
            nextStepAt,
          })
          .where(eq(sequenceEnrollments.id, draft.enrollmentId));
      }
    } catch (err) {
      logger.warn(
        "bulk-approve: enrollment advance failed (non-blocking)",
        {
          draftId: draft.id,
          enrollmentId: draft.enrollmentId,
          err: err instanceof Error ? err.message : String(err),
        },
      );
    }

    inngest
      .send({
        name: "email.send.queued",
        data: { draftId: draft.id, tenantId: authCtx.tenantId },
      })
      .catch((err) =>
        logger.warn(
          "bulk-approve: inngest emit failed (non-blocking)",
          {
            draftId: draft.id,
            err: err instanceof Error ? err.message : String(err),
          },
        ),
      );
  }

  return Response.json({
    approved: approvedIds,
    queuedAt: new Date().toISOString(),
  });
}
