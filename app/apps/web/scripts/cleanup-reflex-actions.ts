/**
 * Mark leftover REFLEX agent actions (signal/deal_stale/meeting → create_deal/
 * create_task) as 'failed'. We removed reflexive deal/task creation entirely
 * (deals come from booked discovery calls; updates from transcript/email
 * analysis), so these queued intents should not linger as 'scheduled'.
 *
 * Usage (from app/apps/web):
 *   tsx --env-file=.env.local scripts/cleanup-reflex-actions.ts [--tenant=ID]          # dry run
 *   tsx --env-file=.env.local scripts/cleanup-reflex-actions.ts [--tenant=ID] --apply
 */
import { db } from "@/db";
import { agentActions } from "@/db/schema";
import { and, eq, isNull, inArray, sql } from "drizzle-orm";

async function main() {
  const apply = process.argv.includes("--apply");
  const tenantArg = process.argv.find((a) => a.startsWith("--tenant="))?.split("=")[1];

  const predicate = and(
    eq(agentActions.status, "scheduled"),
    isNull(agentActions.reversedAt),
    sql`${agentActions.payload}->>'source' = 'agent-reactor'`,
    inArray(agentActions.actionType, ["create_deal", "create_task"]),
    sql`${agentActions.payload}->>'trigger' IN ('signal_detected','deal_stale','meeting_completed')`,
    tenantArg ? eq(agentActions.tenantId, tenantArg) : undefined,
  );

  const rows = await db
    .select({ id: agentActions.id, actionType: agentActions.actionType })
    .from(agentActions)
    .where(predicate);
  const byType = rows.reduce<Record<string, number>>((a, r) => ((a[r.actionType] = (a[r.actionType] ?? 0) + 1), a), {});
  console.log(`Reflex scheduled actions: ${rows.length}`, byType);

  if (!apply) { console.log("DRY RUN — pass --apply to mark them 'failed'."); process.exit(0); }
  if (rows.length === 0) { console.log("nothing to clean"); process.exit(0); }
  const updated = await db
    .update(agentActions)
    .set({ status: "failed", errorMessage: "reflex deal/task creation removed", updatedAt: new Date() })
    .where(predicate)
    .returning({ id: agentActions.id });
  console.log(`APPLIED — marked ${updated.length} reflex action(s) 'failed'.`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
