/**
 * Inngest worker — "Fill it up for me!" derive (B2 R5).
 *
 * Consumes `inbox/writing-style.derive` { userId, tenantId }. Reads the user's
 * most recent <=50 HUMAN-AUTHORED 1:1 sent messages (excludes sequence/campaign
 * sends), strips quoted reply history, and asks the model for a STYLE-ONLY prompt
 * via tracedGenerateObject. The result runs through the deterministic
 * sanitizeDerivedStyle no-PII floor before it is surfaced as a REVIEWABLE
 * proposal — it NEVER overwrites the live prompt (the user accepts it in the UI).
 *
 * Idempotent on userId (concurrency limit 1) so a double-click can't enqueue a
 * duplicate (R5.6). Pure prompt + PII logic lives in lib/inbox/derive-style.ts;
 * this file is the IO orchestrator.
 */

import { z } from "zod";
import { inngest } from "./client";
import { db } from "@/db";
import { connectedMailboxes, outboundEmails } from "@/db/schema";
import { and, eq, desc, inArray, isNull, isNotNull } from "drizzle-orm";
import { buildDerivePrompt, sanitizeDerivedStyle, stripQuotedReply } from "@/lib/inbox/derive-style";
import { saveStyleProposal } from "@/lib/inbox/writing-style";
import { logger } from "@/lib/observability/logger";

interface DeriveEvent {
  data: { userId: string; tenantId: string };
}

const MIN_MESSAGES = 5;
const MAX_MESSAGES = 50;

const deriveSchema = z.object({
  prompt: z.string(),
  aboutMe: z.string().optional(),
  signOff: z.string().optional(),
});

function nowIso(): string {
  return new Date().toISOString();
}

export const deriveWritingStyle = inngest.createFunction(
  {
    id: "inbox-writing-style-derive",
    name: "Inbox writing-style derive (Fill it up for me!)",
    retries: 1,
    // Idempotent per user — a second click while one is running is a no-op (R5.6).
    concurrency: { key: "event.data.userId", limit: 1 },
    onFailure: async ({ error, event }) => {
      const userId = (event as unknown as { data?: { userId?: string } }).data?.userId;
      logger.error("inbox-writing-style-derive.dead_letter", {
        userId,
        err: error instanceof Error ? error.message : String(error),
      });
      if (userId) {
        await saveStyleProposal(userId, {
          status: "rejected",
          reason: "Couldn't derive a style this time. Try again.",
          at: nowIso(),
        }).catch(() => {});
      }
    },
    triggers: [{ event: "inbox/writing-style.derive" }],
  },
  async ({ event }: { event: DeriveEvent }) => {
    const { userId, tenantId } = event.data;
    if (!userId || !tenantId) return { skipped: "missing_ids" };

    // 1) The user's own connected mailboxes (personal scope).
    const boxes = await db
      .select({ id: connectedMailboxes.id })
      .from(connectedMailboxes)
      .where(and(eq(connectedMailboxes.tenantId, tenantId), eq(connectedMailboxes.userId, userId)));
    const boxIds = boxes.map((b) => b.id);

    if (boxIds.length === 0) {
      await saveStyleProposal(userId, {
        status: "insufficient",
        reason: "No connected mailbox yet — connect one and send a few replies first.",
        at: nowIso(),
      });
      return { status: "insufficient", reason: "no_mailbox" };
    }

    // 2) Recent human-authored 1:1 sent mail (exclude sequence/campaign sends).
    const rows = await db
      .select({ bodyText: outboundEmails.bodyText })
      .from(outboundEmails)
      .where(
        and(
          eq(outboundEmails.tenantId, tenantId),
          inArray(outboundEmails.mailboxId, boxIds),
          eq(outboundEmails.status, "sent"),
          isNull(outboundEmails.campaignId),
          isNull(outboundEmails.enrollmentId),
          isNotNull(outboundEmails.bodyText),
        ),
      )
      .orderBy(desc(outboundEmails.sentAt))
      .limit(MAX_MESSAGES);

    const bodies = rows
      .map((r) => stripQuotedReply(r.bodyText ?? ""))
      .filter((b) => b.trim().length > 0);

    if (bodies.length < MIN_MESSAGES) {
      await saveStyleProposal(userId, {
        status: "insufficient",
        reason: `Only ${bodies.length} personal sent message(s) found — send a few more 1:1 replies, then try again.`,
        at: nowIso(),
      });
      return { status: "insufficient", count: bodies.length };
    }

    // 3) Derive a STYLE-ONLY prompt (model picked like compose-reply).
    const [{ tracedGenerateObject }, { anthropic }, { openai }] = await Promise.all([
      import("@/lib/ai/traced-ai"),
      import("@/lib/ai/ai-provider"),
      import("@ai-sdk/openai"),
    ]);
    const model = process.env.ANTHROPIC_API_KEY
      ? anthropic("claude-haiku-4-5-20251001")
      : process.env.OPENAI_API_KEY
        ? openai("gpt-4o-mini")
        : null;
    if (!model) {
      await saveStyleProposal(userId, {
        status: "rejected",
        reason: "AI is currently unavailable.",
        at: nowIso(),
      });
      return { status: "rejected", reason: "no_model" };
    }

    const { object } = await tracedGenerateObject({
      model,
      schema: deriveSchema,
      prompt: buildDerivePrompt(bodies),
      _trace: { agentId: "inbox-derive-style", tenantId, inputPreview: "derive writing style" },
    });
    const proposed = object as { prompt: string; aboutMe?: string; signOff?: string };

    // 4) Deterministic no-PII / no-echo floor (R5.5) — reject rather than leak.
    const check = sanitizeDerivedStyle(proposed.prompt ?? "", bodies);
    if (!check.ok || !(proposed.prompt ?? "").trim()) {
      await saveStyleProposal(userId, {
        status: "rejected",
        reason: check.ok ? "The derived style was empty." : `Derived style was rejected: ${check.reasons.join("; ")}.`,
        at: nowIso(),
      });
      return { status: "rejected", reasons: check.reasons };
    }

    // 5) Surface as a reviewable proposal (never auto-applied, R5.4).
    await saveStyleProposal(userId, {
      status: "ready",
      prompt: proposed.prompt.trim().slice(0, 2000),
      aboutMe: (proposed.aboutMe ?? "").trim().slice(0, 600) || undefined,
      signOff: (proposed.signOff ?? "").trim().slice(0, 120) || undefined,
      at: nowIso(),
    });
    return { status: "ready", messages: bodies.length };
  },
);
