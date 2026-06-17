import { getAuthContext } from "@/lib/auth/auth-utils";
import { buildConversations } from "@/lib/inbox/conversations";
import { loadConversationRows } from "@/lib/inbox/load";
import { getInboxScope, scopeConversationRows } from "@/lib/inbox/user-scope";
import { summarizeThread, type ThreadMessage } from "@/lib/inbox/summarize-thread";

/**
 * POST /api/inbox/conversations/summarize  { key }  (INBOX-S01/S08)
 *
 * On-demand thread TL;DR + key points + citations. Called only when the user
 * clicks "Summarize thread" in the pane, so opening a conversation never spends
 * a token. Re-loads the thread server-side by key (owner/tenant-scoped — a
 * member can't summarize another user's thread) rather than trusting client text.
 */
export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let key: string;
  try {
    key = String(((await req.json()) as { key?: unknown }).key || "").trim();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!key) return Response.json({ error: "key required" }, { status: 400 });

  try {
    const scope = await getInboxScope(authCtx.tenantId, authCtx.userId);
    const rows = scopeConversationRows(await loadConversationRows(authCtx.tenantId), scope);
    const conversation = buildConversations(rows).find((c) => c.key === key);
    if (!conversation) return Response.json({ error: "Conversation not found" }, { status: 404 });

    const messages: ThreadMessage[] = conversation.messages.map((m) => ({
      direction: m.direction,
      from: m.from,
      body: m.body,
      at: m.at,
    }));

    const summary = await summarizeThread(messages);
    return Response.json({ summary });
  } catch (error) {
    console.error("Failed to summarize thread:", error);
    return Response.json({ error: "Failed to summarize thread" }, { status: 500 });
  }
}
