import { getAuthContext } from "@/lib/auth/auth-utils";
import { buildConversations } from "@/lib/inbox/conversations";
import { loadConversationRows } from "@/lib/inbox/load";
import { getInboxScope, scopeConversationRows } from "@/lib/inbox/user-scope";
import { parseIcs } from "@/lib/inbox/parse-ics";
import { isRsvpChoice, rsvpSubject, rsvpBody, buildReplyIcs, type RsvpChoice } from "@/lib/inbox/rsvp";
import { deliverInteractiveEmail } from "@/lib/emails/deliver-interactive";

/**
 * POST /api/inbox/rsvp  { key, choice: "yes" | "maybe" | "no" }  (INBOX-CAL04)
 *
 * RSVP to an inbound meeting invite: re-load the thread by key (owner-scoped),
 * parse its .ics, build a METHOD:REPLY with the responder's PARTSTAT, and email
 * it back to the organizer as the owner. The live send rides the same chokepoint
 * as the composer (deliverInteractiveEmail) — opt-out, plan limits and the
 * OUTBOUND_TEST_MODE guardrail all apply. The calendar-write of the user's own
 * event (CAL04's deeper half) is deferred; this is the iTIP reply.
 */
export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let key: string;
  let choice: RsvpChoice;
  try {
    const body = (await req.json()) as { key?: unknown; choice?: unknown };
    key = String(body.key || "").trim();
    if (!isRsvpChoice(body.choice)) return Response.json({ error: "Invalid choice" }, { status: 400 });
    choice = body.choice;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!key) return Response.json({ error: "key required" }, { status: 400 });

  try {
    const scope = await getInboxScope(authCtx.tenantId, authCtx.userId);
    const rows = scopeConversationRows(await loadConversationRows(authCtx.tenantId), scope);
    const conversation = buildConversations(rows).find((c) => c.key === key);
    if (!conversation) return Response.json({ error: "Conversation not found" }, { status: 404 });

    // The most recent message carrying a calendar part is the live invite.
    const invite = [...conversation.messages].reverse().find((m) => m.calendar);
    const event = invite?.calendar ? parseIcs(invite.calendar) : null;
    if (!event || !event.organizer || !event.uid) {
      return Response.json({ error: "No reply-able invitation in this thread" }, { status: 422 });
    }

    // The responder is the address the invite was sent to (the inbound `to` is
    // the user's own mailbox — the invited attendee).
    const responderEmail = invite?.to || "";
    if (!responderEmail) {
      return Response.json({ error: "Couldn't determine your invite address" }, { status: 422 });
    }

    const replyIcs = buildReplyIcs({ event, responderEmail, choice });
    if (!replyIcs) return Response.json({ error: "Couldn't build the reply" }, { status: 422 });

    const result = await deliverInteractiveEmail({
      tenantId: authCtx.tenantId,
      ownerAppUserId: authCtx.appUserId,
      to: event.organizer,
      subject: rsvpSubject(choice, event.summary),
      body: rsvpBody(choice, event.summary),
      icsInvite: { method: "REPLY", content: replyIcs, filename: "reply.ics" },
      skipUnsubscribe: true,
      source: "rsvp",
    });

    if (!result.ok) {
      return Response.json({ error: result.error, code: result.code }, { status: 422 });
    }
    return Response.json({ ok: true, choice });
  } catch (error) {
    console.error("Failed to RSVP:", error);
    return Response.json({ error: "Failed to send RSVP" }, { status: 500 });
  }
}
