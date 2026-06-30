/**
 * Shared prompt-assembly for a reply/nudge draft: voice + standing
 * instructions + tone + mailbox-voice override, plus (for "reply" mode only)
 * KB + account-brief grounding. Extracted from
 * app/api/inbox/compose/reply/route.ts (byte-identical behavior preserved —
 * see that file's own tests) so the P2 follow-up-nudge cron
 * (inngest/followup-nudge-cron.ts) drafts with the EXACT SAME recipe as the
 * founder's own "Generate draft" button. One source of truth, no drift
 * between the interactive and cron-driven paths.
 */
import { db } from "@/db";
import { contacts, deals } from "@/db/schema";
import { and, eq, desc, isNull } from "drizzle-orm";
import { buildEnrichedContext } from "@/lib/context/enriched-prospect-context";
import { loadReplyKnowledgeBlock, knowledgeSection } from "@/lib/inbox/reply-knowledge";
import { buildReplyContextBrief } from "@/lib/inbox/reply-context";
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
 * Resolve the conversation counterparty into an audience-routing segment (B2
 * R4.2): the reply recipient's email (→ domain) plus the matched contact's
 * title/tags. Tags live in contacts.properties.tags (no dedicated column).
 */
export async function resolveRecipientSegment(
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

export interface ConversationForInstructions {
  fromAddress?: string | null;
  contactId?: string | null;
  // from/to are required (not nullable) to satisfy attributeMailbox's
  // AttributableMessage shape — mirrors ConversationMessage (conversations.ts).
  messages: Array<{
    direction: "inbound" | "outbound";
    from: string;
    to: string;
    body?: string | null;
    at: string | null;
  }>;
}

export interface MailboxesForInstructions {
  mailboxes: Array<{ id: string; address: string; label: string; shared?: boolean }>;
}

/**
 * Assemble the full instructions/context pair composeReply() needs. Identical
 * to what app/api/inbox/compose/reply/route.ts built inline before this
 * extraction — same inputs, same outputs, same knowledge/account-brief skip
 * for mode==="nudge" (a "we haven't heard back" re-surface must add no new
 * facts, so it stays voice-only and costs nothing extra).
 */
export async function buildReplyInstructions(
  tenantId: string,
  userId: string,
  conversation: ConversationForInstructions,
  scope: MailboxesForInstructions,
  mode: "reply" | "nudge",
): Promise<{ instructions: string; context: string | undefined }> {
  const style = await getWritingStyle(userId);
  const recipient = await resolveRecipientSegment(tenantId, conversation);
  const audienceId = selectAudience(style, recipient)?.id;
  const { prompt: stylePrompt } = buildWritingStylePrompt(style, audienceId);
  const voice = buildVoicePrompt(await getVoicePrefs(userId));
  // Single sign-off: writing-style's "Sign off with …" is canonical, so when it
  // provides one we omit memory.signOffName — otherwise this prompt would carry
  // two conflicting signatures (Settings IA de-dup).
  const { prompt: memory } = buildMemoryPrompt(await getInboxMemory(userId), {
    omitSignOff: Boolean(style.signOff?.trim()),
  });
  // A3: if the thread's own mailbox has a voice override, layer it on (it wins
  // for that box; absent → the per-user voice). Scrubbed against auto-send.
  const threadMailboxId = attributeMailbox(conversation.messages, indexMailboxes(scope.mailboxes)).mailboxId;
  const mailboxVoice = threadMailboxId
    ? buildMailboxVoiceBlock((await getMailboxIdentities(userId))[threadMailboxId])
    : "";
  const instructions = [stylePrompt, voice, memory, mailboxVoice].filter(Boolean).join("\n\n");

  // P0 — ground the draft in SUBSTANCE, not just voice, for "reply" mode only.
  // Skip for nudges: a "we haven't heard back" re-surface must add no new
  // facts (compose-reply.ts nudge task), so it stays voice-only.
  const contactId = conversation.contactId ?? null;
  const [knowledge, accountBrief] =
    mode === "nudge"
      ? ["", ""]
      : await Promise.all([
          loadReplyKnowledgeBlock(tenantId),
          (async () => {
            if (!contactId) return "";
            try {
              const [deal] = await db
                .select({ id: deals.id, stage: deals.stage })
                .from(deals)
                .where(and(eq(deals.tenantId, tenantId), eq(deals.contactId, contactId), isNull(deals.deletedAt)))
                .orderBy(desc(deals.updatedAt))
                .limit(1);
              // maxEmails:0 — the brief uses only signals + graph facts, so skip
              // the (discarded) verbatim email-body fetch; the thread is already
              // in the prompt.
              const enriched = await buildEnrichedContext(contactId, tenantId, {
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
  return { instructions: groundedInstructions, context: accountBrief || undefined };
}
