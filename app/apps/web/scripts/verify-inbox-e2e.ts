/**
 * E2E data verification for inbox-triage: seeds a disposable "E2E " tenant
 * with realistic inbound/outbound rows, runs the production read-model
 * (loadConversationRows + buildConversations) against the LIVE database,
 * asserts lane/priority/reason behavior, then hard-deletes the tenant's
 * rows. Everything is scoped to the synthetic tenant id.
 */
import { db } from "../src/db";
import { tenants, contacts, activities, outboundEmails, inboxTriage } from "../src/db/schema";
import { eq } from "drizzle-orm";
import { loadConversationRows } from "../src/lib/inbox/load";
import { buildConversations, laneCounts } from "../src/lib/inbox/conversations";

const H = 3600_000;
const now = Date.now();
const at = (hoursAgo: number) => new Date(now - hoursAgo * H);

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function main() {
  // ── Seed ──
  const [tenant] = await db
    .insert(tenants)
    .values({ name: "E2E Inbox Triage Verify", plan: "trial" })
    .returning({ id: tenants.id });
  const tid = tenant.id;
  console.log(`seeded tenant ${tid}`);

  try {
    const [alice] = await db
      .insert(contacts)
      .values({ tenantId: tid, firstName: "Alice", lastName: "Hot", email: "alice@e2e.test" })
      .returning({ id: contacts.id });
    const [bob] = await db
      .insert(contacts)
      .values({ tenantId: tid, firstName: "Bob", lastName: "Ooo", email: "bob@e2e.test" })
      .returning({ id: contacts.id });

    // Thread A: outbound step 1 + interested inbound reply (with thread intelligence)
    await db.insert(outboundEmails).values({
      tenantId: tid, contactId: alice.id, threadId: "e2e-thread-a", stepNumber: 1,
      fromAddress: "me@elevay.dev", toAddress: "alice@e2e.test",
      subject: "Elevay <> E2E", bodyHtml: "<p>hello</p>", bodyText: "hello",
      status: "sent", sentAt: at(30), repliedAt: at(2), replySnippet: "oui, appelez-moi",
      replyClassification: "meeting_request",
    });
    await db.insert(activities).values({
      tenantId: tid, actorType: "contact", actorId: alice.id, entityType: "contact", entityId: alice.id,
      activityType: "email_received", channel: "email", direction: "inbound",
      occurredAt: at(2), summary: "Re: Elevay <> E2E",
      rawContent: "Oui, appelez-moi demain matin pour en discuter. Quel est votre prix ?",
      sentiment: "positive", intent: ["interested", "question"], threadId: "e2e-thread-a",
      metadata: {
        from: "alice@e2e.test", to: "me@elevay.dev",
        threadIntelligence: {
          threadId: "e2e-thread-a",
          signals: [{ type: "timeline", evidence: "appelez-moi demain matin", confidence: 0.9 }],
          competitors: [], sentiment: "positive", sentimentTrend: "improving",
          objections: [], nextSteps: ["Call tomorrow morning"], urgencyLevel: "high",
          extractedAt: new Date().toISOString(),
        },
      },
    });

    // Thread B: out-of-office inbound → handled lane
    await db.insert(activities).values({
      tenantId: tid, actorType: "contact", actorId: bob.id, entityType: "contact", entityId: bob.id,
      activityType: "email_received", channel: "email", direction: "inbound",
      occurredAt: at(5), summary: "Absence du bureau",
      rawContent: "Je suis absent jusqu'au 20 juin.",
      sentiment: "neutral", intent: ["out_of_office"], threadId: "e2e-thread-b",
      metadata: { from: "bob@e2e.test", to: "me@elevay.dev" },
    });

    // Thread C: neutral inbound, no thread id (contact fallback grouping)
    await db.insert(activities).values({
      tenantId: tid, actorType: "contact", actorId: bob.id, entityType: "contact", entityId: bob.id,
      activityType: "email_received", channel: "email", direction: "inbound",
      occurredAt: at(1), summary: "Documentation",
      rawContent: "Merci pour les documents.", sentiment: "neutral", intent: [], threadId: null,
      metadata: { from: "bob@e2e.test", to: "me@elevay.dev" },
    });

    // Thread D: bounced outbound, no inbound → handled
    await db.insert(outboundEmails).values({
      tenantId: tid, contactId: null, threadId: "e2e-thread-d", stepNumber: 1,
      fromAddress: "me@elevay.dev", toAddress: "dead@e2e.test",
      subject: "Bounce test", bodyHtml: "<p>x</p>", bodyText: "x",
      status: "bounced", sentAt: at(10), bouncedAt: at(9), bounceType: "hard",
    });

    // ── Run the production read-model ──
    const rows = await loadConversationRows(tid);
    const convs = buildConversations(rows);
    const counts = laneCounts(convs);
    console.log("laneCounts:", JSON.stringify(counts));

    check("attention lane has 2 conversations (interested + neutral)", counts.attention === 2, JSON.stringify(counts));
    check("handled lane has 2 conversations (ooo + bounce)", counts.handled === 2);

    const threadA = convs.find((c) => c.key === "e2e-thread-a");
    check("thread A is P1 attention", threadA?.lane === "attention" && threadA?.priority === 1, `lane=${threadA?.lane} P=${threadA?.priority}`);
    check("thread A reason from labels", threadA?.reason === "Meeting request" || threadA?.reason === "Interested", `reason=${threadA?.reason}`);
    check("thread A joins outbound+inbound", threadA?.messageCount === 2);
    check("thread A carries intelligence", !!threadA?.intelligence, JSON.stringify(threadA?.intelligence)?.slice(0, 60));

    const threadB = convs.find((c) => c.key === "e2e-thread-b");
    check("ooo thread is handled with reschedule note", threadB?.lane === "handled" && (threadB?.handledNote ?? "").includes("rescheduled"), `note=${threadB?.handledNote}`);

    const contactConv = convs.find((c) => c.key === `contact:${bob.id}`);
    check("thread-less inbound groups under contact key", !!contactConv && contactConv.lane === "attention");

    const bounce = convs.find((c) => c.key === "e2e-thread-d");
    check("bounced-only thread is handled", bounce?.lane === "handled" && (bounce?.handledNote ?? "").includes("Bounced"), `note=${bounce?.handledNote}`);

    check("attention ordering: P1 thread before neutral", convs.filter((c) => c.lane === "attention")[0]?.key === "e2e-thread-a");

    // ── Triage verbs on thread A: done → (newer inbound) reopen ──
    const tnow = new Date();
    await db.insert(inboxTriage).values({
      tenantId: tid, conversationKey: "e2e-thread-a", status: "done", doneAt: tnow, updatedAt: tnow,
    });
    let convs2 = buildConversations(await loadConversationRows(tid));
    check("done moves thread A out of attention", convs2.find((c) => c.key === "e2e-thread-a")?.lane === "done");

    await db.insert(activities).values({
      tenantId: tid, actorType: "contact", actorId: alice.id, entityType: "contact", entityId: alice.id,
      activityType: "email_received", channel: "email", direction: "inbound",
      occurredAt: new Date(tnow.getTime() + 1000), summary: "Re: Elevay <> E2E",
      rawContent: "Finalement, plutôt jeudi ?", sentiment: "positive", intent: ["interested"], threadId: "e2e-thread-a",
      metadata: { from: "alice@e2e.test", to: "me@elevay.dev" },
    });
    convs2 = buildConversations(await loadConversationRows(tid));
    check("new inbound REOPENS the done conversation", convs2.find((c) => c.key === "e2e-thread-a")?.lane === "attention");

    console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECKS FAILED`);
  } finally {
    // ── Cleanup: hard-delete everything scoped to the synthetic tenant ──
    await db.delete(inboxTriage).where(eq(inboxTriage.tenantId, tid));
    await db.delete(activities).where(eq(activities.tenantId, tid));
    await db.delete(outboundEmails).where(eq(outboundEmails.tenantId, tid));
    await db.delete(contacts).where(eq(contacts.tenantId, tid));
    await db.delete(tenants).where(eq(tenants.id, tid));
    console.log(`cleaned tenant ${tid}`);
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error("VERIFY FAILED:", e);
  process.exit(1);
});
