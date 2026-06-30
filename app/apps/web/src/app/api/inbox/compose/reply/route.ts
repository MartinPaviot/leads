import { getAuthContext } from "@/lib/auth/auth-utils";
import { buildConversations } from "@/lib/inbox/conversations";
import { loadConversationRows } from "@/lib/inbox/load";
import { getInboxScope, scopeConversationRows } from "@/lib/inbox/user-scope";
import { composeReply, type ReplyDraft } from "@/lib/inbox/compose-reply";
import type { ThreadMessage } from "@/lib/inbox/summarize-thread";
import { getAiProfile, aiEnabled } from "@/lib/inbox/ai-profile";
import { buildReplyInstructions } from "@/lib/inbox/reply-instructions";

/**
 * POST /api/inbox/compose/reply  { key }  (INBOX-C01 / G08)
 *
 * Drafts a complete, voice-matched reply to a thread, grounded in its messages +
 * the user's standing instructions (O02) + tone (O03). Re-loads the thread
 * server-side by key, owner/tenant-scoped (getInboxScope), read-only and
 * approval-gated — it returns a draft, never sends. Gated on the AI profile
 * (P03; off ⇒ empty). Fail-closed: empty ⇒ the composer stays as-is.
 *
 * The prompt-assembly itself (voice/tone/memory/mailbox-voice + KB/account-
 * brief grounding) lives in lib/inbox/reply-instructions.ts — shared verbatim
 * with the P2 follow-up-nudge cron (inngest/followup-nudge-cron.ts) so a
 * cron-drafted nudge reads exactly like one this button would have produced.
 */
export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let key: string;
  let mode: "reply" | "nudge" = "reply";
  try {
    const body = (await req.json()) as { key?: unknown; mode?: unknown };
    key = String(body.key || "").trim();
    if (body.mode === "nudge") mode = "nudge"; // B7: gentle follow-up; same fail-closed path
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

    const { instructions, context } = await buildReplyInstructions(
      authCtx.tenantId,
      authCtx.userId,
      conversation,
      scope,
      mode,
    );

    const result: ReplyDraft = await composeReply(messages, {
      instructions,
      context,
      mode,
    });
    return Response.json(result);
  } catch (error) {
    console.error("Failed to compose reply:", error);
    return Response.json({ error: "Failed to compose reply" }, { status: 500 });
  }
}
