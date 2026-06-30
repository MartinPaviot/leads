import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { contacts, deals } from "@/db/schema";
import { and, eq, desc, isNull } from "drizzle-orm";
import { buildEnrichedContext } from "@/lib/context/enriched-prospect-context";
import { loadReplyKnowledgeBlock, knowledgeSection } from "@/lib/inbox/reply-knowledge";
import { buildReplyContextBrief } from "@/lib/inbox/reply-context";
import { buildConversations } from "@/lib/inbox/conversations";
import { loadConversationRows } from "@/lib/inbox/load";
import { getInboxScope, scopeConversationRows } from "@/lib/inbox/user-scope";
import { composeReply, type ReplyDraft } from "@/lib/inbox/compose-reply";
import type { ThreadMessage } from "@/lib/inbox/summarize-thread";
import { getAiProfile, aiEnabled } from "@/lib/inbox/ai-profile";
import { getInboxMemory, buildMemoryPrompt } from "@/lib/inbox/ai-memory";
import { getVoicePrefs, buildVoicePrompt } from "@/lib/inbox/voice-prefs";
import {
  getWritingStyle,
  selectAudience,
  buildWritingStylePrompt,
  type RecipientSegment,
} from "@/lib/inbox/writing-style";
import { attributeMailbox, indexMailboxes } from "@/lib/inbox/mailbox-attribution";
import { getMailboxIdentities, buildMailboxVoiceBlock } from "@/lib/inbox/mailbox-identity";

/**
 * Resolve the conversation counterparty into an audience-routing segment (B2 R4.2):
 * the reply recipient's email (→ domain) plus the matched contact's title/tags.
 * Tags live in contacts.properties.tags (no dedicated column). Read-only.
 */
async function resolveRecipientSegment(
  tenantId: string,
  conversation: { fromAddress?: string | null; contactId?: string | null },
): Promise<RecipientSegment> {
  const email = conversation.fromAddress ?? null;
  let title: string | null = null;
  let tags: string[] = [];
  if (conversation.contactId) {
    const [c] = await db
      .select({ title: contacts.title, properties: contacts.properties })
      .from(contacts)
      .where(and(eq(contacts.id, conversation.contactId), eq(contacts.tenantId, tenantId)))
      .limit(1);
    if (c) {
      title = c.title ?? null;
      const props = c.properties && typeof c.properties === "object" ? (c.properties as Record<string, unknown>) : {};
      if (Array.isArray(props.tags)) tags = props.tags.filter((x): x is string => typeof x === "string");
    }
  }
  return { email, title, tags };
}

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

    // B2: lead with the user's writing-style block (base prompt, or the audience
    // variant the counterparty resolves to), then tone, then standing memory.
    // Backward-compatible: an empty record yields the default prompt (R3.5).
    const style = await getWritingStyle(authCtx.userId);
    const recipient = await resolveRecipientSegment(authCtx.tenantId, conversation);
    const audienceId = selectAudience(style, recipient)?.id;
    const { prompt: stylePrompt } = buildWritingStylePrompt(style, audienceId);
    const voice = buildVoicePrompt(await getVoicePrefs(authCtx.userId));
    // Single sign-off: writing-style's "Sign off with …" is canonical, so when it
    // provides one we omit memory.signOffName — otherwise this prompt would carry
    // two conflicting signatures (Settings IA de-dup).
    const { prompt: memory } = buildMemoryPrompt(await getInboxMemory(authCtx.userId), {
      omitSignOff: Boolean(style.signOff?.trim()),
    });
    // A3: if the thread's own mailbox has a voice override, layer it on (it wins
    // for that box; absent → the per-user voice). Scrubbed against auto-send.
    const threadMailboxId = attributeMailbox(conversation.messages, indexMailboxes(scope.mailboxes)).mailboxId;
    const mailboxVoice = threadMailboxId
      ? buildMailboxVoiceBlock((await getMailboxIdentities(authCtx.userId))[threadMailboxId])
      : "";
    const instructions = [stylePrompt, voice, memory, mailboxVoice].filter(Boolean).join("\n\n");

    // P0 — ground the draft in SUBSTANCE, not just voice. (1) the tenant's product
    // knowledge (pricing / capabilities / objection rebuttals — "" until seeded,
    // then it lights up on its own), and (2) a compact deal/account brief (open
    // objections, pending next steps, budget/champion signals, competitors, deal
    // stage). Both additive + fail-soft: a stranger thread with no contact/KB
    // degrades to exactly the prior voice-only draft. This is what lets the reply
    // ANSWER "pricing for 8 seats?" instead of always deferring to a call.
    // Skip for nudges: a "we haven't heard back" re-surface must add no new facts
    // (compose-reply.ts nudge task), so it stays voice-only — and costs nothing.
    const contactId = conversation.contactId ?? null;
    const [knowledge, accountBrief] =
      mode === "nudge"
        ? ["", ""]
        : await Promise.all([
            loadReplyKnowledgeBlock(authCtx.tenantId),
            (async () => {
              if (!contactId) return "";
              try {
                const [deal] = await db
                  .select({ id: deals.id, stage: deals.stage })
                  .from(deals)
                  .where(and(eq(deals.tenantId, authCtx.tenantId), eq(deals.contactId, contactId), isNull(deals.deletedAt)))
                  .orderBy(desc(deals.updatedAt))
                  .limit(1);
                // maxEmails:0 — the brief uses only signals + graph facts, so skip
                // the (discarded) verbatim email-body fetch; the thread is already
                // in the prompt.
                const enriched = await buildEnrichedContext(contactId, authCtx.tenantId, {
                  ...(deal?.id ? { dealId: deal.id } : {}),
                  maxEmails: 0,
                }).catch(() => null);
                return buildReplyContextBrief(enriched, deal?.stage ?? null);
              } catch {
                // Account grounding is additive — never fail a draft over it.
                return "";
              }
            })(),
          ]);
    const groundedInstructions = [instructions, knowledgeSection(knowledge)].filter(Boolean).join("\n\n");

    const result: ReplyDraft = await composeReply(messages, {
      instructions: groundedInstructions,
      context: accountBrief || undefined,
      mode,
    });
    return Response.json(result);
  } catch (error) {
    console.error("Failed to compose reply:", error);
    return Response.json({ error: "Failed to compose reply" }, { status: 500 });
  }
}
