import { getAuthContext } from "@/lib/auth/auth-utils";
import { buildConversations } from "@/lib/inbox/conversations";
import { loadConversationRows } from "@/lib/inbox/load";
import { getInboxScope, scopeConversationRows } from "@/lib/inbox/user-scope";
import { composeDigest, digestTitle, type DigestItem, type DigestKind } from "@/lib/inbox/digest";

/**
 * GET /api/inbox/digest  (INBOX-N02)
 *
 * Composes the morning / end-of-day digest content for the viewer's inbox,
 * owner/tenant-scoped and read-only. Each conversation is classified into a
 * digest section from its latest message. Delivery cadence rides the
 * notification prefs + Inngest (deferred); this returns the content a digest
 * would render. ?evening=1 selects the end-of-day framing.
 */
const OVERDUE_MS = 24 * 60 * 60 * 1000;

export async function GET(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const evening = new URL(req.url).searchParams.get("evening") === "1";

  try {
    const scope = await getInboxScope(authCtx.tenantId, authCtx.userId);
    const rows = scopeConversationRows(await loadConversationRows(authCtx.tenantId), scope);
    const conversations = buildConversations(rows);
    const now = Date.now();

    const items: DigestItem[] = conversations.map((c) => {
      const last = c.messages[c.messages.length - 1];
      const lastInbound = [...c.messages].reverse().find((m) => m.direction === "inbound");
      let kind: DigestKind = "other";
      if (last && last.direction === "inbound") {
        const ageMs = last.at ? now - new Date(last.at).getTime() : 0;
        kind = ageMs > OVERDUE_MS ? "overdue" : "awaiting_reply";
      }
      return {
        key: c.key,
        subject: c.subject || "(no subject)",
        from: lastInbound?.from || last?.from || "",
        kind,
        at: last?.at ?? null,
      };
    });

    const digest = composeDigest(items, digestTitle(evening));
    return Response.json({ digest });
  } catch (error) {
    console.error("Failed to compose digest:", error);
    return Response.json({ error: "Failed to compose digest" }, { status: 500 });
  }
}
