/**
 * Kairos accelerator (B3, _specs/pilae-machine/spec-v2.md R4.3).
 *
 * When a fresh high-weight signal fires on a company, bump the
 * `next_step_at` of every active enrollment whose contact works at
 * that company forward to NOW. This is the kairos policy layer on
 * top of the chronos default cadence: the founder's J1→J10 schedule
 * survives unchanged, but a fresh lift-signal jumps the enrolled
 * contacts to the front of the queue.
 *
 * The pure decision is in `lib/scoring/priority-score.ts#decideAcceleration`;
 * this function is the I/O wrapper that fans the decision across
 * every active enrollment at the affected company.
 *
 * Event payload:
 *   {
 *     tenantId: string,
 *     companyId: string,
 *     signalType: string,
 *     signalFiredAt: string (ISO),
 *     signalMultiplier: number (precomputed lift from signal_outcomes)
 *   }
 *
 * Producer wiring (emitting `signals/fresh-detected` from
 * `signal-monitor.ts` / `realtime-signal-handler.ts`) is a follow-up
 * commit — the consumer is shipped first so the decision logic can
 * be reviewed and tested in isolation.
 */

import { inngest } from "./client";
import { db } from "@/db";
import { sequenceEnrollments, contacts } from "@/db/schema";
import { and, eq, gt, isNotNull } from "drizzle-orm";
import {
  decideAcceleration,
  type EnrollmentStatus,
} from "@/lib/scoring/priority-score";

type AcceleratorEvent = {
  data: {
    tenantId: string;
    companyId: string;
    signalType: string;
    signalFiredAt: string;
    signalMultiplier: number;
  };
};

export const signalAccelerateCadence = inngest.createFunction(
  {
    id: "signal-accelerate-cadence",
    retries: 1,
    triggers: [{ event: "signals/fresh-detected" }],
  },
  async ({ event, step }: { event: AcceleratorEvent; step: any }) => {
    const { tenantId, companyId, signalType, signalFiredAt, signalMultiplier } =
      event.data;
    const now = new Date();
    const firedAt = new Date(signalFiredAt);

    // 1. Fan-out — every active enrollment for a contact at this
    //    company is a candidate. We pre-filter on the cheap criteria
    //    (status=active, next_step_at in the future) at the DB layer
    //    so the per-row decision loop stays small.
    const candidates = await step.run(
      "find-candidate-enrollments",
      async () => {
        return db
          .select({
            id: sequenceEnrollments.id,
            status: sequenceEnrollments.status,
            nextStepAt: sequenceEnrollments.nextStepAt,
            contactId: sequenceEnrollments.contactId,
          })
          .from(sequenceEnrollments)
          .innerJoin(contacts, eq(contacts.id, sequenceEnrollments.contactId))
          .where(
            and(
              eq(contacts.tenantId, tenantId),
              eq(contacts.companyId, companyId),
              eq(sequenceEnrollments.status, "active"),
              isNotNull(sequenceEnrollments.nextStepAt),
              gt(sequenceEnrollments.nextStepAt, now),
            ),
          );
      },
    );

    if (candidates.length === 0) {
      return {
        bumped: 0,
        candidates: 0,
        signalType,
        reason: "no_active_enrollments",
      };
    }

    // 2. Decide + apply per row. We loop in user code (not SQL) so
    //    the decision function stays the single source of truth —
    //    moving the rule into SQL would split the policy across two
    //    languages and break the test guarantee.
    let bumped = 0;
    const skipReasons: Record<string, number> = {};

    for (const enrollment of candidates) {
      const decision = decideAcceleration({
        signalFiredAt: firedAt,
        signalMultiplier,
        enrollmentStatus: enrollment.status as EnrollmentStatus,
        enrollmentNextStepAt: enrollment.nextStepAt,
        now,
      });

      if (!decision.shouldBump) {
        skipReasons[decision.reason] = (skipReasons[decision.reason] ?? 0) + 1;
        continue;
      }

      await step.run(`bump-${enrollment.id}`, async () => {
        await db
          .update(sequenceEnrollments)
          .set({ nextStepAt: now })
          .where(eq(sequenceEnrollments.id, enrollment.id));
      });
      bumped++;
    }

    return {
      bumped,
      candidates: candidates.length,
      signalType,
      skipReasons,
    };
  },
);
