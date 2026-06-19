import { getAuthContext } from "@/lib/auth/auth-utils";
import { buildConversations } from "@/lib/inbox/conversations";
import { loadConversationRows } from "@/lib/inbox/load";
import { getInboxScope, scopeConversationRows } from "@/lib/inbox/user-scope";
import { composeReply, type ReplyDraft } from "@/lib/inbox/compose-reply";
import type { ThreadMessage } from "@/lib/inbox/summarize-thread";
import { getAiProfile, aiEnabled } from "@/lib/inbox/ai-profile";
import { getInboxMemory, buildMemoryPrompt } from "@/lib/inbox/ai-memory";
import { getVoicePrefs, buildVoicePrompt } from "@/lib/inbox/voice-prefs";

/**
 * POST /api/inbox/compose/reply  { key }  (INBOX-C01 / G08)
 *
 * Drafts a complete, voice-matched reply to a thread, grounded in its messages +
 * the user's standing instructions (O02) + tone (O03). Re-loads the thread
 * server-side by key, owner/tenant-scoped (getInboxScope), read-only and
 * approval-gated — it returns a draft, never sends. Gated on the AI profile
 * (P03; off ⇒ empty). Fail-closed: empty ⇒ the composer stays as-is.
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

  if (!aiEnabled(await getAiProfile(authCtx.userId))) {
    return Response.json({ subject: "", text: "" });
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

    const voice = buildVoicePrompt(await getVoicePrefs(authCtx.userId));
    const { prompt: memory } = buildMemoryPrompt(await getInboxMemory(authCtx.userId));
    const instructions = [voice, memory].filter(Boolean).join("\n\n");

    const result: ReplyDraft = await composeReply(messages, { instructions });
    return Response.json(result);
  } catch (error) {
    console.error("Failed to compose reply:", error);
    return Response.json({ error: "Failed to compose reply" }, { status: 500 });
  }
}
