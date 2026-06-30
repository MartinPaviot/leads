import { db } from "@/db";
import { activities, tasks, deals, contacts, companies, users } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { inngest } from "@/inngest/client";
import { tracedGenerateText } from "@/lib/ai/traced-ai";
import { anthropic } from "@/lib/ai/ai-provider";
import { openai } from "@ai-sdk/openai";
import { autofillDealFromIntelligence } from "@/lib/deals/deal-autofill";
import type { ThreadIntelligence, BuyingSignal } from "@/lib/emails/email-intelligence";
import { applyMeetingQualificationToCrm } from "./meeting-crm";
import { buildFollowUpPrompt } from "./follow-up-prompt";
import { isInternalMeeting } from "@/lib/recording/branding";
import { extractDomain } from "@/lib/util/email";
import type { MeetingNotes } from "./notes-schema";

export interface PostCallResult {
  success: boolean;
  alreadyProcessed?: boolean;
  notFound?: boolean;
  noNotes?: boolean;
  tasks: number;
  followUpDraft: string;
  dealUpdated: boolean;
}

export interface PostCallOptions {
  activityId: string;
  tenantId: string;
  /** Task assignee. Null for server-side (webhook) runs — the task is created
   *  unassigned. assignee_id is nullable in the schema. */
  userId: string | null;
  createTasks?: boolean;
  generateFollowUp?: boolean;
  updateDeal?: boolean;
  dealId?: string;
  force?: boolean;
}

/**
 * Post-call pipeline: create tasks from action items, update the linked deal +
 * account with buying signals, autofill deal fields, and generate a follow-up
 * email DRAFT (it never sends). Idempotent via meta.postCallProcessedAt.
 *
 * Shared by the manual route (/api/meetings/[id]/post-call) and the Recall
 * webhook (processTranscriptFromBot) so a recorded meeting is captured
 * automatically on call-end without the user clicking "Confirm". The webhook
 * runs it with userId=null; a later manual click is a no-op (idempotent).
 */
export async function processPostCall(opts: PostCallOptions): Promise<PostCallResult> {
  const { activityId, tenantId, userId } = opts;
  const createTasks = opts.createTasks !== false;
  const generateFollowUp = opts.generateFollowUp !== false;
  const updateDeal = opts.updateDeal !== false;

  const [activity] = await db
    .select()
    .from(activities)
    .where(
      and(
        eq(activities.id, activityId),
        eq(activities.tenantId, tenantId),
        isNull(activities.deletedAt),
      ),
    )
    .limit(1);

  if (!activity) {
    return { success: false, notFound: true, tasks: 0, followUpDraft: "", dealUpdated: false };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const meta = (activity.metadata || {}) as any;
  const notes = meta.structuredNotes;
  if (!notes) {
    return { success: false, noNotes: true, tasks: 0, followUpDraft: "", dealUpdated: false };
  }

  // Idempotency — task creation is unconditional, so a second run would
  // duplicate every task. Return the stored result unless force is set.
  if (meta.postCallProcessedAt && !opts.force) {
    return {
      success: true,
      alreadyProcessed: true,
      tasks: Array.isArray(meta.generatedTaskIds) ? meta.generatedTaskIds.length : 0,
      followUpDraft: typeof meta.followUpEmailDraft === "string" ? meta.followUpEmailDraft : "",
      dealUpdated: false,
    };
  }

  const createdTaskIds: string[] = [];
  let followUpDraft = "";
  let dealUpdated = false;
  let meetingIsInternal = false;

  // 1. Create tasks from action items
  if (createTasks && notes.actionItems?.length) {
    for (const item of notes.actionItems) {
      const [task] = await db
        .insert(tasks)
        .values({
          tenantId,
          title: item.task,
          description: `From meeting: ${activity.summary}\nOwner: ${item.owner}${item.deadline ? `\nDeadline: ${item.deadline}` : ""}`,
          status: "pending",
          priority: "medium",
          assigneeId: userId,
          entityType: activity.entityType,
          entityId: activity.entityId,
          dueDate: parseDeadline(item.deadline),
        })
        .returning();
      createdTaskIds.push(task.id);
    }
  }

  // 2. Update deal with buying signals
  if (updateDeal && notes.buyingSignals) {
    const dealId = meta.dealId || opts.dealId;
    if (dealId) {
      const [deal] = await db
        .select()
        .from(deals)
        .where(and(eq(deals.id, dealId), eq(deals.tenantId, tenantId), isNull(deals.deletedAt)))
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
              .where(and(eq(companies.id, deal.companyId), eq(companies.tenantId, tenantId), isNull(companies.deletedAt)))
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

  // 2b. Auto-fill deal fields from meeting buying signals
  if (updateDeal && notes.buyingSignals) {
    const dealId = meta.dealId || opts.dealId;
    if (dealId) {
      try {
        const meetingIntelligence = meetingNotesToIntelligence(notes, activity.id);
        const contactId =
          activity.entityType === "contact" && activity.entityId !== "unknown"
            ? activity.entityId
            : undefined;

        await autofillDealFromIntelligence({
          dealId,
          tenantId,
          intelligence: meetingIntelligence,
          sourceType: "meeting",
          contactId,
        });
      } catch (err) {
        console.warn("post-call: deal autofill failed", err);
      }
    }
  }

  // 2c. Meeting qualification → CRM (MEDDPICC + account intel + contact profile)
  // through the review seam, on the SAME property keys the call path writes, so
  // the call-intel surfaces on the meeting fiche populate from the meeting
  // itself — not just from prior calls. Non-fatal; never blocks the pipeline.
  if (updateDeal) {
    try {
      await applyMeetingQualificationToCrm({
        tenantId,
        meetingId: activity.id,
        notes: notes as MeetingNotes,
        occurredAt: activity.occurredAt ?? new Date(),
        dealId: meta.dealId || opts.dealId || null,
        contactId:
          activity.entityType === "contact" && activity.entityId !== "unknown"
            ? activity.entityId
            : null,
      });
    } catch (err) {
      console.warn("post-call: meeting qualification write failed", err);
    }
  }

  // 3. Generate follow-up email draft (never sent)
  if (generateFollowUp) {
    const model = process.env.ANTHROPIC_API_KEY
      ? anthropic("claude-sonnet-4-6")
      : process.env.OPENAI_API_KEY
        ? openai("gpt-4o-mini")
        : null;

    if (model) {
      // Detect an all-internal (cofounder) meeting so the draft is an
      // internal recap, not a sales follow-up. Resolve the org domain from
      // an admin user; fail toward "external" (the sales default) on any gap.
      try {
        const [admin] = await db
          .select({ email: users.email })
          .from(users)
          .where(and(eq(users.tenantId, tenantId), eq(users.role, "admin")))
          .limit(1);
        const primaryDomain = admin?.email ? extractDomain(admin.email) : null;
        const attendeeEmails = (
          (meta.attendees as Array<{ email?: string }> | undefined) ?? []
        ).map((a) => a.email ?? "");
        meetingIsInternal = isInternalMeeting(attendeeEmails, primaryDomain);
      } catch {
        // Default to the sales follow-up on any lookup failure.
      }

      let contactContext = "";
      if (activity.entityType === "contact" && activity.entityId !== "unknown") {
        const [contact] = await db
          .select()
          .from(contacts)
          .where(and(eq(contacts.id, activity.entityId), isNull(contacts.deletedAt)))
          .limit(1);
        if (contact) {
          contactContext = `Recipient: ${contact.firstName} ${contact.lastName} (${contact.title || ""})\n`;
          if (contact.companyId) {
            const [company] = await db
              .select()
              .from(companies)
              .where(and(eq(companies.id, contact.companyId), isNull(companies.deletedAt)))
              .limit(1);
            if (company) contactContext += `Company: ${company.name}\n`;
          }
        }
      }

      const { text } = await tracedGenerateText({
        model,
        prompt: buildFollowUpPrompt({
          internal: meetingIsInternal,
          meetingTitle: activity.summary ?? "",
          date: String(meta.startTime || activity.occurredAt || ""),
          contactContext,
          summary: notes.summary,
          keyPoints: notes.keyPoints ?? [],
          actionItems: notes.actionItems ?? [],
          nextSteps: notes.buyingSignals?.nextSteps ?? [],
          decisions: notes.decisions ?? [],
        }),
        providerOptions: {
          anthropic: { cacheControl: { type: "ephemeral" } },
        },
        _trace: {
          agentId: "process-transcript",
          tenantId,
          inputPreview: `${meetingIsInternal ? "Internal recap" : "Follow-up email"} for meeting: ${activity.summary}`,
        },
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
        meetingIsInternal,
        postCallProcessedAt: new Date().toISOString(),
      },
    })
    .where(eq(activities.id, activityId));

  // Feed the meeting into post-interaction coaching + playbook extraction (both
  // fan in from "coaching/post-interaction"). The CALLS path and the manual
  // upload route already emit this; the Recall/Jibri webhook + manual-confirm
  // paths all funnel through processPostCall, which never did — so the
  // production-default recorded meeting taught the brain nothing. Emitting here
  // covers every processPostCall caller at once. Only fires on a real run (the
  // already-processed path returns above), so it's emitted at most once per
  // meeting. Consumers self-gate on an LLM key + load the activity by id;
  // fire-and-forget + fail-soft, never affects the post-call result.
  await inngest
    .send({
      name: "coaching/post-interaction",
      data: { tenantId, activityId, userId: userId ?? undefined },
    })
    .catch((e) => console.warn("post-call: coaching/post-interaction emit failed (non-blocking)", e));

  return { success: true, tasks: createdTaskIds.length, followUpDraft, dealUpdated };
}

/**
 * Parse an action-item deadline into a Date. The LLM extracts deadlines as
 * free text ("Friday", "Next week", "2026-06-12"), so `new Date("Friday")`
 * yields an Invalid Date that throws "RangeError: Invalid time value" on
 * insert. Returns null for anything unparseable (the text is kept in the task
 * description), so a meeting with vague deadlines never crashes the pipeline.
 */
function parseDeadline(deadline: string | null | undefined): Date | null {
  if (!deadline) return null;
  const parsed = new Date(deadline);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// ── Helper: convert meeting notes to ThreadIntelligence shape ──

/**
 * Adapts the structured meeting notes format into a ThreadIntelligence object
 * so autofillDealFromIntelligence can process it uniformly regardless of
 * whether the source was email or meeting.
 */
function meetingNotesToIntelligence(
  notes: Record<string, unknown>,
  activityId: string,
): ThreadIntelligence {
  const signals: BuyingSignal[] = [];
  const buyingSignals = notes.buyingSignals as Record<string, unknown> | undefined;

  if (buyingSignals) {
    if (buyingSignals.budget) {
      signals.push({ type: "budget", evidence: String(buyingSignals.budget), confidence: 0.85 });
    }
    if (buyingSignals.timeline) {
      signals.push({ type: "timeline", evidence: String(buyingSignals.timeline), confidence: 0.85 });
    }
    if (buyingSignals.decisionMaker) {
      signals.push({ type: "authority", evidence: String(buyingSignals.decisionMaker), confidence: 0.8 });
    }
  }

  const competitors = Array.isArray(buyingSignals?.competitors) ? (buyingSignals!.competitors as string[]) : [];
  const sentiment = (buyingSignals?.sentiment as ThreadIntelligence["sentiment"]) || "neutral";

  return {
    threadId: `meeting-${activityId}`,
    signals,
    competitors,
    sentiment,
    sentimentTrend: "stable",
    objections: [],
    nextSteps: Array.isArray(buyingSignals?.nextSteps) ? (buyingSignals!.nextSteps as string[]) : [],
    urgencyLevel: "none",
    extractedAt: new Date().toISOString(),
  };
}
