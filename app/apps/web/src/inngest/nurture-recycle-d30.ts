/**
 * Daily cron — nurture recycle at J+30 (B6, _specs/pilae-machine/spec-v2.md R5.6).
 *
 * Scope: per tenant, find every sequence enrollment that:
 *   - reached `completed` status
 *   - has a `lastStepAt` older than 30 days
 *   - belongs to a contact that is NOT already in the tenant's Nurture
 *     sequence (avoid the recycle loop)
 * Re-enroll those contacts into the Nurture sequence at step 1.
 *
 * The decision rule lives in `lib/sequences/nurture-recycle.ts`
 * (`shouldRecycleEnrollment`) so it tests without a DB. This file is
 * the I/O orchestrator. The nurture sequence is identified by name
 * (case-insensitive "nurture*") — see `isNurtureSequenceName`.
 *
 * Daily at 07:00 UTC. Single-flight so two concurrent runs can't
 * double-enroll a contact (a UNIQUE constraint on
 * (sequence_id, contact_id) would be cleaner long-term, but it's not
 * present today; we mitigate via concurrency.limit and an existence
 * check at insert time).
 */

import { inngest } from "./client";
import { guardEnrollment } from "@/lib/anti-collision/enroll-guard";
import { db } from "@/db";
import {
  contacts,
  sequences,
  sequenceEnrollments,
  tenants,
} from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import {
  isNurtureSequenceName,
  shouldRecycleEnrollment,
  DEFAULT_NURTURE_WINDOW_DAYS,
} from "@/lib/sequences/nurture-recycle";
import type { EnrollmentStatus } from "@/lib/scoring/priority-score";
import { logger } from "@/lib/observability/logger";

export const nurtureRecycleD30 = inngest.createFunction(
  {
    id: "nurture-recycle-d30",
    name: "Cron: Nurture recycle (J+30)",
    retries: 1,
    concurrency: [{ limit: 1 }],
    onFailure: async ({ error }) => {
      logger.error("nurture-recycle-d30.dead_letter", {
        err: error instanceof Error ? error.message : String(error),
      });
    },
    triggers: [{ cron: "0 7 * * *" }],
  },
  async ({ step }: {
    step: { run<T>(id: string, fn: () => Promise<T> | T): Promise<T> };
  }) => {
    const now = new Date();

    const allTenants = await step.run("fetch-tenants", async () =>
      db.select({ id: tenants.id }).from(tenants),
    );

    let totalRecycled = 0;
    const perTenant: Array<{
      tenantId: string;
      recycled: number;
      skipped: Record<string, number>;
    }> = [];

    for (const t of allTenants) {
      const result = await step.run(`tenant-${t.id}`, async () => {
        // Find the tenant's Nurture sequence (active only).
        const tenantSequences = await db
          .select({
            id: sequences.id,
            name: sequences.name,
            status: sequences.status,
          })
          .from(sequences)
          .where(
            and(
              eq(sequences.tenantId, t.id),
              eq(sequences.status, "active"),
            ),
          );

        const nurture = tenantSequences.find((s) =>
          isNurtureSequenceName(s.name),
        );
        if (!nurture) {
          return {
            recycled: 0,
            skipped: { no_nurture_sequence: 1 },
          };
        }

        // Candidate enrollments: completed, in this tenant.
        // We join to contacts so the tenant scope holds (enrollments
        // don't carry tenantId directly).
        const candidates = await db
          .select({
            enrollmentId: sequenceEnrollments.id,
            status: sequenceEnrollments.status,
            lastStepAt: sequenceEnrollments.lastStepAt,
            contactId: sequenceEnrollments.contactId,
          })
          .from(sequenceEnrollments)
          .innerJoin(
            contacts,
            eq(contacts.id, sequenceEnrollments.contactId),
          )
          .where(
            and(
              eq(contacts.tenantId, t.id),
              eq(sequenceEnrollments.status, "completed"),
            ),
          );

        if (candidates.length === 0) {
          return { recycled: 0, skipped: { no_candidates: 1 } };
        }

        // Find contacts already enrolled in the nurture sequence to
        // avoid the recycle loop.
        const alreadyInNurture = await db
          .select({ contactId: sequenceEnrollments.contactId })
          .from(sequenceEnrollments)
          .where(
            and(
              eq(sequenceEnrollments.sequenceId, nurture.id),
              inArray(
                sequenceEnrollments.contactId,
                candidates.map((c) => c.contactId),
              ),
            ),
          );
        const alreadyInNurtureSet = new Set(
          alreadyInNurture.map((r) => r.contactId),
        );

        let recycled = 0;
        const skipped: Record<string, number> = {};

        for (const c of candidates) {
          if (alreadyInNurtureSet.has(c.contactId)) {
            skipped.already_in_nurture =
              (skipped.already_in_nurture ?? 0) + 1;
            continue;
          }
          const decision = shouldRecycleEnrollment({
            status: c.status as EnrollmentStatus,
            lastStepAt: c.lastStepAt,
            now,
            windowDays: DEFAULT_NURTURE_WINDOW_DAYS,
          });
          if (!decision.recycle) {
            skipped[decision.reason] = (skipped[decision.reason] ?? 0) + 1;
            continue;
          }
          // Spec 14 — anti-collision (record-only unless ANTI_COLLISION_ENFORCE).
          const ac = await guardEnrollment({ tenantId: t.id, contactId: c.contactId, enrollmentId: `${nurture.id}:${c.contactId}` });
          if (!ac.proceed) {
            skipped["anti_collision"] = (skipped["anti_collision"] ?? 0) + 1;
            continue;
          }
          await db.insert(sequenceEnrollments).values({
            sequenceId: nurture.id,
            contactId: c.contactId,
            status: "active",
            currentStep: 1,
            nextStepAt: now,
          }).onConflictDoNothing();
          recycled++;
        }
        return { recycled, skipped };
      });

      perTenant.push({
        tenantId: t.id,
        recycled: result.recycled,
        skipped: result.skipped,
      });
      totalRecycled += result.recycled;
    }

    if (totalRecycled > 0) {
      logger.info("nurture-recycle-d30.completed", {
        totalRecycled,
        tenants: perTenant.length,
      });
    }

    return { totalRecycled, perTenant };
  },
);
