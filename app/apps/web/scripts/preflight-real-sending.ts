/**
 * Read-only pre-flight before turning OUTBOUND_TEST_MODE off:
 * what would actually send, and is the inbound side ready?
 */
import { db } from "../src/db";
import {
  sequences,
  sequenceEnrollments,
  outboundEmails,
  connectedMailboxes,
  contacts,
} from "../src/db/schema";
import { and, eq, sql, isNotNull, lte, inArray } from "drizzle-orm";

const TENANT = "47dca783-dac0-45a5-85cb-d217b2a3174d";

async function main() {
  const activeSeqs = await db
    .select({ id: sequences.id, name: sequences.name, status: sequences.status, createdBy: sequences.createdBy })
    .from(sequences)
    .where(and(eq(sequences.tenantId, TENANT), eq(sequences.status, "active")));
  console.log(`active sequences: ${activeSeqs.length}`);
  for (const s of activeSeqs) console.log(`  - ${s.name} (${s.id.slice(0, 8)})`);

  const seqIds = activeSeqs.map((s) => s.id);
  if (seqIds.length > 0) {
    const [enr] = await db
      .select({
        active: sql<number>`count(*) filter (where ${sequenceEnrollments.status} = 'active')`,
        dueNow: sql<number>`count(*) filter (where ${sequenceEnrollments.status} = 'active' and ${sequenceEnrollments.nextStepAt} <= now())`,
        due24h: sql<number>`count(*) filter (where ${sequenceEnrollments.status} = 'active' and ${sequenceEnrollments.nextStepAt} <= now() + interval '24 hours')`,
      })
      .from(sequenceEnrollments)
      .where(inArray(sequenceEnrollments.sequenceId, seqIds));
    console.log(`enrollments on active sequences: active=${enr.active} dueNow=${enr.dueNow} due24h=${enr.due24h}`);
  }

  const [queued] = await db
    .select({
      queued: sql<number>`count(*) filter (where ${outboundEmails.status} = 'queued')`,
      drafts: sql<number>`count(*) filter (where ${outboundEmails.status} = 'draft')`,
      failed: sql<number>`count(*) filter (where ${outboundEmails.status} = 'failed')`,
    })
    .from(outboundEmails)
    .where(eq(outboundEmails.tenantId, TENANT));
  console.log(`outbound rows: queued=${queued.queued} drafts=${queued.drafts} failed=${queued.failed}`);

  // Queued recipients preview (what would fly on the next worker tick)
  const queuedRows = await db
    .select({ to: outboundEmails.toAddress, subject: outboundEmails.subject })
    .from(outboundEmails)
    .where(and(eq(outboundEmails.tenantId, TENANT), eq(outboundEmails.status, "queued")))
    .limit(10);
  for (const q of queuedRows) console.log(`  queued → ${q.to} | ${q.subject.slice(0, 50)}`);

  const boxes = await db
    .select({
      email: connectedMailboxes.emailAddress,
      provider: connectedMailboxes.provider,
      status: connectedMailboxes.status,
      lastUid: connectedMailboxes.imapLastUid,
      dailyLimit: connectedMailboxes.dailyLimit,
      sentToday: connectedMailboxes.sentToday,
    })
    .from(connectedMailboxes)
    .where(eq(connectedMailboxes.tenantId, TENANT));
  console.log(`connected mailboxes: ${boxes.length}`);
  for (const b of boxes) console.log(`  - ${b.email} provider=${b.provider} status=${b.status} imapLastUid=${b.lastUid} sent=${b.sentToday}/${b.dailyLimit}`);

  const [contactsWithEmail] = await db
    .select({ n: sql<number>`count(*)` })
    .from(contacts)
    .where(and(eq(contacts.tenantId, TENANT), isNotNull(contacts.email), sql`${contacts.deletedAt} is null`));
  console.log(`contacts with email: ${contactsWithEmail.n}`);

  process.exit(0);
}

main().catch((e) => {
  console.error("PREFLIGHT FAILED:", e);
  process.exit(1);
});
