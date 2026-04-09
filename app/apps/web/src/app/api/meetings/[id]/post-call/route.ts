import { getAuthContext } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { db } from "@/db";
import { activities, tasks, deals, contacts, companies } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { tracedGenerateText } from "@/lib/traced-ai";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rlResponse = checkRateLimit("llm", authCtx.userId);
  if (rlResponse) return rlResponse;

  const { id } = await params;

  const [activity] = await db
    .select()
    .from(activities)
    .where(
      and(eq(activities.id, id), eq(activities.tenantId, authCtx.tenantId))
    )
    .limit(1);

  if (!activity) {
    return Response.json({ error: "Meeting not found" }, { status: 404 });
  }

  const meta = (activity.metadata || {}) as any;
  const notes = meta.structuredNotes;

  if (!notes) {
    return Response.json({ error: "No processed notes for this meeting" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const createTasks = body.createTasks !== false;
  const generateFollowUp = body.generateFollowUp !== false;
  const updateDeal = body.updateDeal !== false;

  const createdTaskIds: string[] = [];
  let followUpDraft = "";
  let dealUpdated = false;

  // 1. Create tasks from action items
  if (createTasks && notes.actionItems?.length) {
    for (const item of notes.actionItems) {
      const [task] = await db
        .insert(tasks)
        .values({
          tenantId: authCtx.tenantId,
          title: item.task,
          description: `From meeting: ${activity.summary}\nOwner: ${item.owner}${item.deadline ? `\nDeadline: ${item.deadline}` : ""}`,
          status: "pending",
          priority: "medium",
          assigneeId: authCtx.appUserId,
          entityType: activity.entityType,
          entityId: activity.entityId,
          dueDate: item.deadline ? new Date(item.deadline) : null,
        })
        .returning();
      createdTaskIds.push(task.id);
    }
  }

  // 2. Update deal with buying signals
  if (updateDeal && notes.buyingSignals) {
    const dealId = meta.dealId || body.dealId;
    if (dealId) {
      const [deal] = await db
        .select()
        .from(deals)
        .where(and(eq(deals.id, dealId), eq(deals.tenantId, authCtx.tenantId)))
        .limit(1);

      if (deal) {
        const props = (deal.properties || {}) as Record<string, unknown>;
        const extracted: Record<string, unknown> = {};
        if (notes.buyingSignals.budget) extracted.budget = notes.buyingSignals.budget;
        if (notes.buyingSignals.teamSize) extracted.teamSize = notes.buyingSignals.teamSize;
        if (notes.buyingSignals.currentStack?.length) extracted.currentTools = notes.buyingSignals.currentStack;
        if (notes.buyingSignals.competitors?.length) extracted.competitors = notes.buyingSignals.competitors;
        if (notes.buyingSignals.timeline) extracted.timeline = notes.buyingSignals.timeline;
        if (notes.buyingSignals.painPoints?.length) extracted.painPoints = notes.buyingSignals.painPoints;

        if (Object.keys(extracted).length > 0) {
          await db
            .update(deals)
            .set({
              properties: {
                ...props,
                extractedIntel: {
                  ...((props.extractedIntel || {}) as Record<string, unknown>),
                  ...extracted,
                  lastExtracted: new Date().toISOString(),
                  sourceActivity: activity.id,
                },
              },
              updatedAt: new Date(),
            })
            .where(eq(deals.id, dealId));
          dealUpdated = true;

          // Also write extracted intel to the account record
          if (deal.companyId) {
            const [company] = await db
              .select()
              .from(companies)
              .where(and(eq(companies.id, deal.companyId), eq(companies.tenantId, authCtx.tenantId)))
              .limit(1);
            if (company) {
              const companyProps = (company.properties || {}) as Record<string, unknown>;
              await db
                .update(companies)
                .set({
                  properties: {
                    ...companyProps,
                    meetingIntel: {
                      ...((companyProps.meetingIntel || {}) as Record<string, unknown>),
                      ...extracted,
                      lastExtracted: new Date().toISOString(),
                      sourceDeal: dealId,
                    },
                  },
                  updatedAt: new Date(),
                })
                .where(eq(companies.id, deal.companyId));
            }
          }
        }
      }
    }
  }

  // 3. Generate follow-up email draft
  if (generateFollowUp) {
    const model = process.env.ANTHROPIC_API_KEY
      ? anthropic("claude-sonnet-4-6")
      : process.env.OPENAI_API_KEY
        ? openai("gpt-4o-mini")
        : null;

    if (model) {
      // Get contact context
      let contactContext = "";
      if (activity.entityType === "contact" && activity.entityId !== "unknown") {
        const [contact] = await db
          .select()
          .from(contacts)
          .where(eq(contacts.id, activity.entityId))
          .limit(1);
        if (contact) {
          contactContext = `Recipient: ${contact.firstName} ${contact.lastName} (${contact.title || ""})\n`;
          if (contact.companyId) {
            const [company] = await db
              .select()
              .from(companies)
              .where(eq(companies.id, contact.companyId))
              .limit(1);
            if (company) contactContext += `Company: ${company.name}\n`;
          }
        }
      }

      const { text } = await tracedGenerateText({
        model,
        prompt: `Write a follow-up email after this sales meeting. The email should feel like it was written by someone who was in the meeting and paid close attention.

MEETING: ${activity.summary}
DATE: ${meta.startTime || activity.occurredAt}
${contactContext}

MEETING SUMMARY: ${notes.summary}

KEY POINTS DISCUSSED:
${notes.keyPoints?.map((p: string) => `- ${p}`).join("\n") || "None recorded"}

ACTION ITEMS:
${notes.actionItems?.map((a: any) => `- ${a.task} (owner: ${a.owner})${a.deadline ? ` — by ${a.deadline}` : ""}`).join("\n") || "None"}

NEXT STEPS:
${notes.buyingSignals?.nextSteps?.join("\n- ") || "None specified"}

<example>
MEETING: Product demo with Sarah Chen (CTO, Meridian Labs)
KEY POINTS: Liked the reporting feature, concerned about SSO integration timeline, team of 12 developers
ACTION ITEMS: Send pricing by Friday (us), Share SOC 2 report (us), Internal review with CFO (them)

FOLLOW-UP EMAIL:
Hi Sarah,

Thanks for the deep-dive today — great questions from your team, especially around the reporting workflows.

Two things I'm following up on:
1. Pricing breakdown for 12 seats — I'll have this in your inbox by Friday
2. Our SOC 2 report — sending separately this afternoon

On your end, you mentioned running this by David before moving forward. Happy to jump on a quick call with him if that would help move things along.

Talk soon,
</example>

RULES:
- 3-4 short paragraphs, never more
- Reference 2-3 SPECIFIC discussion points from the meeting (not generic)
- List your action items with clear timelines
- Acknowledge their action items without being pushy
- Tone: professional, warm, like a colleague — not a vendor
- Start with "Hi [first name]," — use actual names
- End with a forward-looking close, never "let me know if you have questions"
- Output ONLY the email body — no subject line, no "Subject:" prefix`,
        _trace: { agentId: "process-transcript", tenantId: authCtx.tenantId, inputPreview: `Follow-up email for meeting: ${activity.summary}` },
      });

      followUpDraft = text;
    }
  }

  // Save results back to activity metadata
  await db
    .update(activities)
    .set({
      metadata: {
        ...meta,
        generatedTaskIds: createdTaskIds,
        followUpEmailDraft: followUpDraft,
        postCallProcessedAt: new Date().toISOString(),
      },
    })
    .where(eq(activities.id, id));

  return Response.json({
    success: true,
    tasks: createdTaskIds.length,
    followUpDraft,
    dealUpdated,
  });
}
