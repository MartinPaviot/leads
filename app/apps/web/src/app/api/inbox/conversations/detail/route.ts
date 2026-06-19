import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { outboundEmails, sequenceEnrollments, sequences, deals, activities, contacts, companies } from "@/db/schema";
import { and, eq, desc, isNull, inArray } from "drizzle-orm";
import { buildConversations } from "@/lib/inbox/conversations";
import { selectFreshCompanySignals } from "@/lib/inbox/company-signals";
import { loadConversationRows, contactNameMap } from "@/lib/inbox/load";
import { getInboxScope, scopeConversationRows } from "@/lib/inbox/user-scope";
import { suggestNextAction, deriveSituation } from "@/lib/inbox/next-action";
import { INTERACTION_ACTIVITY_TYPES } from "@/lib/accounts/last-interaction";
import { extractActionItems } from "@/lib/inbox/action-items";
import { extractEntities } from "@/lib/inbox/entities";

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

    // Personal inbox: only resolve conversations in the user's own mailbox, so
    // a member can't open another user's thread by guessing its key.
    const scope = await getInboxScope(authCtx.tenantId, authCtx.userId);
    const rows = scopeConversationRows(await loadConversationRows(authCtx.tenantId), scope);
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

    // Suggested next action (INBOX-G05) — the contact's latest open deal stage
    // + the conversation situation, turned into one concrete cited prompt.
    // Suggests, never auto-acts. And the last interaction of ANY channel
    // (INBOX-G03) so the pane shows touch recency beyond this thread.
    let nextAction: { action: string; why: string; stage: string | null } | null = null;
    let lastInteraction: { at: string; type: string } | null = null;
    if (contactId) {
      const [deal] = await db
        .select({ stage: deals.stage })
        .from(deals)
        .where(and(eq(deals.tenantId, authCtx.tenantId), eq(deals.contactId, contactId), isNull(deals.deletedAt)))
        .orderBy(desc(deals.updatedAt))
        .limit(1);
      const stage = deal?.stage ?? null;
      const situation = deriveSituation(conversation);
      // Only surface when there's a deal stage or a clear situational cue — a
      // bare "review and decide" on a fresh inbound isn't worth the space.
      if (stage || (situation !== "new" && situation !== "replied")) {
        const sa = suggestNextAction(stage ?? "", situation);
        nextAction = { action: sa.action, why: sa.why, stage };
      }

      const [act] = await db
        .select({ activityType: activities.activityType, occurredAt: activities.occurredAt })
        .from(activities)
        .where(
          and(
            eq(activities.tenantId, authCtx.tenantId),
            eq(activities.entityType, "contact"),
            eq(activities.entityId, contactId),
            isNull(activities.deletedAt),
            inArray(activities.activityType, [...INTERACTION_ACTIVITY_TYPES]),
          ),
        )
        .orderBy(desc(activities.occurredAt))
        .limit(1);
      if (act?.occurredAt) {
        lastInteraction = { at: new Date(act.occurredAt).toISOString(), type: act.activityType };
      }
    }

    // Fresh company-level GTM signals (INBOX-G04) — hiring / funding / leadership
    // change etc. from the contact's company, dropped once past their shelf life
    // (lib/signals/freshness). Read-only over the existing companies.properties JSONB.
    let freshSignals: { type: string; title: string; description: string }[] = [];
    if (contactId) {
      const [c] = await db
        .select({ companyId: contacts.companyId })
        .from(contacts)
        .where(and(eq(contacts.id, contactId), eq(contacts.tenantId, authCtx.tenantId)))
        .limit(1);
      if (c?.companyId) {
        const [co] = await db
          .select({ properties: companies.properties })
          .from(companies)
          .where(and(eq(companies.id, c.companyId), eq(companies.tenantId, authCtx.tenantId)))
          .limit(1);
        freshSignals = selectFreshCompanySignals(co?.properties);
      }
    }

    // Action items (INBOX-S04) + key entities (INBOX-S05) — deterministic
    // extraction over the thread's inbound text. Pure, fail-soft, no LLM.
    const inboundText = conversation.messages
      .filter((m) => m.direction === "inbound")
      .map((m) => m.body)
      .join("\n\n");
    const actionItems = extractActionItems(inboundText).slice(0, 6);
    const ent = extractEntities(inboundText);
    // High-signal entities only — money + dates + phones. URLs/emails are
    // signature noise in practice.
    const entities = { amounts: ent.amounts, dates: ent.dates, phones: ent.phones };

    return Response.json({
      conversation: {
        ...conversation,
        displayName: contact?.name || conversation.fromAddress || "Unknown sender",
      },
      contact,
      enrollment,
      preparedDraft,
      nextAction,
      lastInteraction,
      actionItems,
      entities,
      freshSignals,
    });
  } catch (error) {
    console.error("Failed to load conversation detail:", error);
    return Response.json({ error: "Failed to load conversation detail" }, { status: 500 });
  }
}
