import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { outboundEmails, sequenceEnrollments, sequences } from "@/db/schema";
import { and, eq, desc, isNull, inArray } from "drizzle-orm";
import { buildConversations } from "@/lib/inbox/conversations";
import { loadConversationRows, contactNameMap } from "@/lib/inbox/load";

/**
 * GET /api/inbox/conversations/detail?key=<conversationKey>
 *
 * Full thread for one conversation: messages with complete bodies,
 * persisted thread intelligence, the contact, an active/paused sequence
 * enrollment (for the "Stop sequence" action) and the agent's prepared
 * draft reply if reply-handler generated one after the last inbound.
 */
export async function GET(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const url = new URL(req.url, "http://localhost");
    const key = url.searchParams.get("key");
    if (!key) return Response.json({ error: "key required" }, { status: 400 });

    const rows = await loadConversationRows(authCtx.tenantId);
    const conversation = buildConversations(rows).find((c) => c.key === key);
    if (!conversation) return Response.json({ error: "Conversation not found" }, { status: 404 });

    const contactId = conversation.contactId;
    const names = contactId ? await contactNameMap(authCtx.tenantId, [contactId]) : {};
    const contact = contactId
      ? { id: contactId, name: names[contactId]?.name ?? "Unknown", email: names[contactId]?.email ?? null }
      : null;

    // Stoppable enrollment (active or paused) for the focal contact.
    let enrollment: { id: string; sequenceId: string; sequenceName: string; status: string } | null = null;
    if (contactId) {
      const [row] = await db
        .select({
          id: sequenceEnrollments.id,
          sequenceId: sequenceEnrollments.sequenceId,
          status: sequenceEnrollments.status,
          sequenceName: sequences.name,
        })
        .from(sequenceEnrollments)
        .innerJoin(sequences, eq(sequences.id, sequenceEnrollments.sequenceId))
        .where(
          and(
            eq(sequenceEnrollments.contactId, contactId),
            eq(sequences.tenantId, authCtx.tenantId),
            inArray(sequenceEnrollments.status, ["active", "paused"]),
          ),
        )
        .orderBy(desc(sequenceEnrollments.enrolledAt))
        .limit(1);
      if (row) {
        enrollment = {
          id: row.id,
          sequenceId: row.sequenceId,
          sequenceName: row.sequenceName,
          status: row.status ?? "active",
        };
      }
    }

    // Agent-prepared draft: reply-handler inserts status='draft' rows
    // (never picked up by the send worker). Only offer drafts created
    // after the prospect's last message — older ones are stale.
    let preparedDraft: { id: string; subject: string; body: string } | null = null;
    if (contactId && conversation.lastInboundAt) {
      const [draft] = await db
        .select({
          id: outboundEmails.id,
          subject: outboundEmails.subject,
          bodyText: outboundEmails.bodyText,
          createdAt: outboundEmails.createdAt,
        })
        .from(outboundEmails)
        .where(
          and(
            eq(outboundEmails.tenantId, authCtx.tenantId),
            eq(outboundEmails.contactId, contactId),
            eq(outboundEmails.status, "draft"),
            isNull(outboundEmails.sentAt),
          ),
        )
        .orderBy(desc(outboundEmails.createdAt))
        .limit(1);
      if (
        draft?.bodyText &&
        draft.createdAt &&
        new Date(draft.createdAt).getTime() > new Date(conversation.lastInboundAt).getTime()
      ) {
        preparedDraft = { id: draft.id, subject: draft.subject, body: draft.bodyText };
      }
    }

    return Response.json({
      conversation: {
        ...conversation,
        displayName: contact?.name || conversation.fromAddress || "Unknown sender",
      },
      contact,
      enrollment,
      preparedDraft,
    });
  } catch (error) {
    console.error("Failed to load conversation detail:", error);
    return Response.json({ error: "Failed to load conversation detail" }, { status: 500 });
  }
}
