/**
 * Data hygiene: mark scheduled (awaiting-approval) agent actions whose CRM
 * target was deleted/excluded after the agent deferred them as 'cancelled', so
 * they stop sitting as phantom "scheduled" rows (marked 'failed' — the status
 * check constraint allows only scheduled/executed/reversed/failed). The Up Next
 * lane already hides them (live-target filter); this keeps the table honest.
 *
 * Usage (from app/apps/web):
 *   tsx --env-file=.env.local scripts/cleanup-dead-approvals.ts [--tenant=ID]            # dry run
 *   tsx --env-file=.env.local scripts/cleanup-dead-approvals.ts [--tenant=ID] --apply
 */
import { db } from "@/db";
import { agentActions, companies, contacts, deals } from "@/db/schema";
import { and, eq, isNull, inArray } from "drizzle-orm";

async function main() {
  const apply = process.argv.includes("--apply");
  const tenantArg = process.argv.find((a) => a.startsWith("--tenant="))?.split("=")[1];

  const rows = await db
    .select({ id: agentActions.id, tenantId: agentActions.tenantId, payload: agentActions.payload })
    .from(agentActions)
    .where(
      and(
        eq(agentActions.status, "scheduled"),
        isNull(agentActions.reversedAt),
        tenantArg ? eq(agentActions.tenantId, tenantArg) : undefined,
      ),
    );

  // Build live sets per tenant+type.
  const refs = rows
    .map((r) => {
      const p = (r.payload ?? {}) as Record<string, unknown>;
      const t = typeof p.entityType === "string" ? p.entityType : null;
      const id = typeof p.entityId === "string" ? p.entityId : null;
      return t && id && ["company", "contact", "deal"].includes(t) ? { actionId: r.id, tenantId: r.tenantId, t, id } : null;
    })
    .filter(Boolean) as { actionId: string; tenantId: string; t: string; id: string }[];

  const live = new Set<string>();
  const ids = (t: string) => [...new Set(refs.filter((r) => r.t === t).map((r) => r.id))];
  const [coIds, ctIds, dlIds] = [ids("company"), ids("contact"), ids("deal")];
  if (coIds.length)
    (await db.select({ id: companies.id }).from(companies).where(and(inArray(companies.id, coIds), isNull(companies.deletedAt), isNull(companies.excludedReason)))).forEach((c) => live.add(`company:${c.id}`));
  if (ctIds.length)
    (await db.select({ id: contacts.id }).from(contacts).where(and(inArray(contacts.id, ctIds), isNull(contacts.deletedAt)))).forEach((c) => live.add(`contact:${c.id}`));
  if (dlIds.length)
    (await db.select({ id: deals.id }).from(deals).where(and(inArray(deals.id, dlIds), isNull(deals.deletedAt)))).forEach((d) => live.add(`deal:${d.id}`));

  const dead = refs.filter((r) => !live.has(`${r.t}:${r.id}`));
  console.log(`Scheduled approvals with a CRM target: ${refs.length} | live: ${refs.length - dead.length} | DEAD (target removed): ${dead.length}`);

  if (!apply) {
    console.log("DRY RUN — pass --apply to mark the dead ones 'cancelled'.");
    process.exit(0);
  }
  if (dead.length === 0) { console.log("nothing to clean"); process.exit(0); }
  const updated = await db
    .update(agentActions)
    .set({ status: "failed", errorMessage: "target removed before approval", updatedAt: new Date() })
    .where(inArray(agentActions.id, dead.map((d) => d.actionId)))
    .returning({ id: agentActions.id });
  console.log(`APPLIED — marked ${updated.length} dead approval(s) 'failed'.`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
