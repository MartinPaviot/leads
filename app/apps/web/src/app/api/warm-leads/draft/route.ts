import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { checkRateLimit } from "@/lib/infra/rate-limit";
import { tracedGenerateObject } from "@/lib/ai/traced-ai";
import { anthropic } from "@/lib/ai/ai-provider";
import { z } from "zod";
import { db } from "@/db";
import { activities, contacts } from "@/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { getTenantSettings } from "@/lib/config/tenant-settings";

/**
 * POST /api/warm-leads/draft — drafts a follow-up email for a warm
 * lead, using the actual past conversation as context. The resulting
 * draft routes through WS-1 guardrails at send-time, not here.
 *
 * Body: { contactId: string }
 * Response: { subject, body }
 */
const draftSchema = z.object({
  subject: z.string().min(3).max(200),
  body: z.string().min(20).max(4000),
});

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const rl = await checkRateLimit("llm", authCtx.userId);
  if (rl) return rl;

  const body = (await req.json().catch(() => ({}))) as {
    contactId?: string;
  };
  if (!body.contactId || typeof body.contactId !== "string") {
    return NextResponse.json(
      { error: "contactId required" },
      { status: 400 },
    );
  }

  const [contact] = await db
    .select()
    .from(contacts)
    .where(
      and(
        eq(contacts.id, body.contactId),
        eq(contacts.tenantId, authCtx.tenantId),
        isNull(contacts.deletedAt),
      ),
    )
    .limit(1);
  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  // Pull last 5 activity summaries so the draft actually references
  // the prior exchange (the brief's §2.2 "draft references the actual
  // past exchange" exit condition).
  const recent = await db
    .select({
      summary: activities.summary,
      direction: activities.direction,
      occurredAt: activities.occurredAt,
    })
    .from(activities)
    .where(
      and(
        eq(activities.tenantId, authCtx.tenantId),
        eq(activities.entityType, "contact"),
        eq(activities.entityId, contact.id),
        isNull(activities.deletedAt),
      ),
    )
    .orderBy(desc(activities.occurredAt))
    .limit(5);

  const settings = await getTenantSettings(authCtx.tenantId);
  const tone = settings.aiTone ?? "Direct";
  const productDesc = settings.productDescription ?? "";

  const historyBlock = recent
    .reverse()
    .map(
      (a) =>
        `[${a.occurredAt?.toISOString().slice(0, 10)} · ${a.direction ?? "?"}] ${
          a.summary ?? "(no summary)"
        }`,
    )
    .join("\n");

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "LLM not configured" },
      { status: 500 },
    );
  }

  const { object } = await tracedGenerateObject({
    model: anthropic("claude-sonnet-4-6"),
    schema: draftSchema,
    temperature: 0.3,
    prompt: `Draft a follow-up email for a warm lead we haven't spoken to in a while.

CONTACT: ${[contact.firstName, contact.lastName].filter(Boolean).join(" ")} <${contact.email}>
TITLE: ${contact.title ?? "unknown"}

PRIOR EXCHANGES (oldest → newest):
${historyBlock || "(no history)"}

PRODUCT: ${productDesc || "our product"}
TONE: ${tone}

Write a short, specific follow-up that references the last real exchange naturally. Do NOT re-pitch — pick up the conversation. Keep it under 120 words. Subject line should be personal, not generic.`,
    _trace: {
      agentId: "follow-up-email",
      tenantId: authCtx.tenantId,
      inputPreview: `Warm-lead follow-up for ${contact.email}`,
    },
  });

  return NextResponse.json({ subject: object.subject, body: object.body });
}
