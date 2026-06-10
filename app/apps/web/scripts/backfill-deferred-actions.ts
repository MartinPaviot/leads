/**
 * One-off backfill: existing deferred agent actions were mis-stamped
 * status='executed' (the deferAction graceMs:0 bug). Flip the ones that are
 * genuinely "awaiting approval" (payload.deferralReason set, not reversed,
 * never actually run) to status='scheduled' with NO scheduledExecutionAt, so
 * they surface in the "Needs you" approval lane.
 *
 * Safe: these rows execute nothing until approved (dispatcher skips null
 * scheduledExecutionAt), and email is OUTBOUND_TEST_MODE-gated.
 *
 * Usage (from app/apps/web):
 *   tsx --env-file=.env.local scripts/backfill-deferred-actions.ts            # dry run
 *   tsx --env-file=.env.local scripts/backfill-deferred-actions.ts --apply    # apply
 *   ... --tenant=<tenantId>                                                   # scope to one tenant
 */
import { db } from "@/db";
import { agentActions } from "@/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";

async function main() {
  const apply = process.argv.includes("--apply");
  const tenantArg = process.argv.find((a) => a.startsWith("--tenant="))?.split("=")[1];

  const predicate = and(
    eq(agentActions.status, "executed"),
    isNull(agentActions.reversedAt),
    sql`${agentActions.payload}->>'deferralReason' IS NOT NULL`,
    tenantArg ? eq(agentActions.tenantId, tenantArg) : undefined,
  );

  const rows = await db
    .select({
      id: agentActions.id,
      tenantId: agentActions.tenantId,
      actionType: agentActions.actionType,
    })
    .from(agentActions)
    .where(predicate);

  const byType = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.actionType] = (acc[r.actionType] ?? 0) + 1;
    return acc;
  }, {});

  console.log(`Found ${rows.length} deferred-but-mis-stamped action(s)${tenantArg ? ` for tenant ${tenantArg}` : ""}:`);
  console.log(byType);

  if (!apply) {
    console.log("\nDRY RUN — pass --apply to flip these to status='scheduled' (awaiting approval).");
    process.exit(0);
  }

  const updated = await db
    .update(agentActions)
    .set({ status: "scheduled", scheduledExecutionAt: null, updatedAt: new Date() })
    .where(predicate)
    .returning({ id: agentActions.id });

  console.log(`\nAPPLIED — flipped ${updated.length} row(s) to 'scheduled' (awaiting approval).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
