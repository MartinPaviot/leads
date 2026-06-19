import { getAuthContext } from "@/lib/auth/auth-utils";
import { buildConversations } from "@/lib/inbox/conversations";
import { loadConversationRows } from "@/lib/inbox/load";
import { getInboxScope, scopeConversationRows } from "@/lib/inbox/user-scope";
import { selectRelevantThreads, askInbox, type InboxThread, type ThreadMessage } from "@/lib/inbox/ask-inbox";
import { getInboxMemory, buildMemoryPrompt } from "@/lib/inbox/ai-memory";
import { getAiProfile, aiEnabled } from "@/lib/inbox/ai-profile";

/**
 * POST /api/inbox/ask-inbox  { question }  (INBOX-Q02, keyword variant)
 *
 * Answer a question across the user's WHOLE inbox with citations. Keyword-
 * retrieves the most relevant threads (no embeddings — emails aren't embedded),
 * then answers grounded only in them. Owner/tenant-scoped via getInboxScope (a
 * member never sees another user's mail). Read-only and stateless; each cited
 * thread comes back with a key so the UI can deep-link to /inbox?conversation=.
 */
export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let question: string;
  try {
    const body = (await req.json()) as { question?: unknown };
    question = String(body.question || "").trim();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
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
    const threads: InboxThread[] = buildConversations(rows).map((c) => ({
      key: c.key,
      subject: c.subject,
      messages: c.messages.map(
        (m): ThreadMessage => ({ direction: m.direction, from: m.from, body: m.body, at: m.at }),
      ),
    }));

    const selected = selectRelevantThreads(threads, question, 6);
    const { prompt: instructions } = buildMemoryPrompt(await getInboxMemory(authCtx.userId));
    const result = await askInbox(selected, question, undefined, instructions);
    // Resolve citation indices to linkable thread refs for the UI.
    const citations = result.citations
      .map((i) => selected[i])
      .filter(Boolean)
      .map((t) => ({ key: t.key, subject: t.subject }));

    return Response.json({ result: { answer: result.answer, answered: result.answered, citations } });
  } catch (error) {
    console.error("Failed to answer inbox-wide question:", error);
    return Response.json({ error: "Failed to answer question" }, { status: 500 });
  }
}
