/**
 * Idempotency guard for non-email (manual "Needs you" task) sequence steps.
 *
 * The email send path dedupes duplicate `sequence/step-due` events via
 * `outbound_emails` (enrollmentId + stepNumber). The non-email path writes an
 * `agentActions` row instead, which has no such guard — so two duplicate events
 * (cron overlap, trigger re-delivery, a slow run that hasn't advanced the
 * enrollment yet) would each insert a task → duplicate manual touches. This
 * mirrors the email guard for the manual-task path.
 *
 * Keyed on the payload the manual-task adapter writes (`lib/sequence-dispatch/
 * task-adapter.ts`): payload.enrollmentId + payload.stepId.
 */

import { db as defaultDb } from "@/db";
import { agentActions } from "@/db/schema";
import { and, sql } from "drizzle-orm";

/** True when a manual-channel task already exists for this enrollment + step. */
export async function manualTaskExists(
  enrollmentId: string,
  stepId: string,
  database: typeof defaultDb = defaultDb,
): Promise<boolean> {
  const [row] = await database
    .select({ id: agentActions.id })
    .from(agentActions)
    .where(
      and(
        sql`${agentActions.payload}->>'enrollmentId' = ${enrollmentId}`,
        sql`${agentActions.payload}->>'stepId' = ${stepId}`,
      ),
    )
    .limit(1);
  return !!row;
}
