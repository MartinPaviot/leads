import { getAuthContext } from "@/lib/auth/auth-utils";
import { buildConversations } from "@/lib/inbox/conversations";
import { loadConversationRows } from "@/lib/inbox/load";
import { getInboxScope, scopeConversationRows } from "@/lib/inbox/user-scope";
import { askThread, type ThreadMessage } from "@/lib/inbox/ask-thread";
import { getInboxMemory, buildMemoryPrompt } from "@/lib/inbox/ai-memory";
import { getAiProfile, aiEnabled } from "@/lib/inbox/ai-profile";

/**
 * POST /api/inbox/conversations/ask  { key, question }  (INBOX-Q07)
 *
 * Answer a question grounded ONLY in one thread, with citations. Re-loads the
 * thread server-side by key (owner/tenant-scoped via getInboxScope — a member
 * can't ask about another user's thread) rather than trusting client-sent text.
 * Read-only and stateless: the answer is computed on demand, nothing is written.
 */
export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let key: string;
  let question: string;
  try {
    const body = (await req.json()) as { key?: unknown; question?: unknown };
    key = String(body.key || "").trim();
    question = String(body.question || "").trim();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!key) return Response.json({ error: "key required" }, { status: 400 });
  if (!question) return Response.json({ error: "question required" }, { status: 400 });
  if (question.length > 500) question = question.slice(0, 500);

  if (!aiEnabled(await getAiProfile(authCtx.userId))) {
    return Response.json({
      result: { answer: "AI features are turned off in your settings.", citations: [], answered: false },
    });
  }

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

    const { prompt: instructions } = buildMemoryPrompt(await getInboxMemory(authCtx.userId));
    const result = await askThread(messages, question, undefined, instructions);
    return Response.json({ result });
  } catch (error) {
    console.error("Failed to answer thread question:", error);
    return Response.json({ error: "Failed to answer question" }, { status: 500 });
  }
}
