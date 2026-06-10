/**
 * Live verification of the inbox-triage read-model against the real DB
 * (_specs/inbox-triage evaluation, run with tsx + DATABASE_URL).
 * Read-only except for one triage upsert exercised on a synthetic key
 * (then reopened) — never touches real conversation keys.
 */
import { db } from "../src/db";
import { inboxTriage } from "../src/db/schema";
import { and, eq } from "drizzle-orm";
import { loadConversationRows } from "../src/lib/inbox/load";
import { buildConversations, laneCounts } from "../src/lib/inbox/conversations";

const TENANT = "47dca783-dac0-45a5-85cb-d217b2a3174d";

async function main() {
  const rows = await loadConversationRows(TENANT);
  console.log(`rows: inbound=${rows.inbound.length} outbound=${rows.outbound.length} triage=${rows.triage.length}`);

  const conversations = buildConversations(rows);
  console.log("laneCounts:", JSON.stringify(laneCounts(conversations)));

  for (const lane of ["attention", "handled", "snoozed", "done"] as const) {
    const inLane = conversations.filter((c) => c.lane === lane).slice(0, 5);
    console.log(`\n== ${lane} (${conversations.filter((c) => c.lane === lane).length}) ==`);
    for (const c of inLane) {
      console.log(
        `  [P${c.priority}] key=${c.key.slice(0, 24)} msgs=${c.messageCount} | ${c.subject.slice(0, 40)} | reason="${c.reason}" | intel=${c.intelligence ? "yes" : "no"}`,
      );
    }
  }

  // Triage round-trip on a synthetic key.
  const key = "verify:inbox-triage-script";
  const now = new Date();
  await db
    .insert(inboxTriage)
    .values({ tenantId: TENANT, conversationKey: key, status: "done", doneAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: [inboxTriage.tenantId, inboxTriage.conversationKey],
      set: { status: "done", doneAt: now, snoozedUntil: null, updatedAt: now },
    });
  const [row] = await db
    .select()
    .from(inboxTriage)
    .where(and(eq(inboxTriage.tenantId, TENANT), eq(inboxTriage.conversationKey, key)));
  console.log(`\ntriage upsert ok: status=${row?.status} doneAt=${row?.doneAt?.toISOString()}`);
  await db
    .delete(inboxTriage)
    .where(and(eq(inboxTriage.tenantId, TENANT), eq(inboxTriage.conversationKey, key)));
  console.log("triage cleanup ok");
  process.exit(0);
}

main().catch((e) => {
  console.error("VERIFY FAILED:", e);
  process.exit(1);
});
