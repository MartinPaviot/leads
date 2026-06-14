import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { activities, tasks, deals, contacts, companies, coachingInsights } from "@/db/schema";
import { eq, and, inArray, isNull, desc } from "drizzle-orm";
import { logger } from "@/lib/observability/logger";
import { resolveMeetingCrmTargets } from "@/lib/meetings/meeting-crm";
import { z } from "zod";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const [activity] = await db
    .select()
    .from(activities)
    .where(
      and(eq(activities.id, id), eq(activities.tenantId, authCtx.tenantId), isNull(activities.deletedAt))
    )
    .limit(1);

  if (!activity) {
    return Response.json({ error: "Meeting not found" }, { status: 404 });
  }

  const meta = (activity.metadata || {}) as any;

  // Fetch linked tasks if any
  let linkedTasks: any[] = [];
  if (meta.generatedTaskIds?.length) {
    linkedTasks = await db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.tenantId, authCtx.tenantId),
          inArray(tasks.id, meta.generatedTaskIds),
          isNull(tasks.deletedAt)
        )
      );
  }

  // Normalize the follow-up draft so the UI always sees either null
  // or {subject, body}. The old post-call pipeline stored a plain
  // string in `followUpEmailDraft`; the new PATCH endpoint stores an
  // object with {subject, body}. Keep supporting both.
  let followUpDraft: { subject: string; body: string } | null = null;
  const rawDraft = meta.followUpEmailDraft;
  if (rawDraft && typeof rawDraft === "object") {
    followUpDraft = {
      subject: typeof rawDraft.subject === "string" ? rawDraft.subject : "",
      body: typeof rawDraft.body === "string" ? rawDraft.body : "",
    };
  } else if (typeof rawDraft === "string" && rawDraft.trim()) {
    followUpDraft = { subject: "", body: rawDraft };
  }

  // ── CRM intelligence linked to this meeting ──────────────────────────────
  // Resolve the same deal / company / contact the meeting writer targets
  // (lib/meetings/meeting-crm.ts) so the page shows exactly what was written —
  // the MEDDPICC scorecard, account intel and contact profile (with
  // Approve/Dismiss in review mode), the very same call-intel components.
  const targets = await resolveMeetingCrmTargets(authCtx.tenantId, {
    dealId: typeof meta.dealId === "string" ? meta.dealId : null,
    contactId: activity.entityType === "contact" ? activity.entityId : null,
  });

  let dealRow: { id: string; properties: Record<string, unknown> } | null = null;
  if (targets.dealId) {
    const [row] = await db
      .select({ id: deals.id, properties: deals.properties })
      .from(deals)
      .where(and(eq(deals.id, targets.dealId), eq(deals.tenantId, authCtx.tenantId), isNull(deals.deletedAt)))
      .limit(1);
    dealRow = row ? { id: row.id, properties: (row.properties ?? {}) as Record<string, unknown> } : null;
  }

  let companyRow: { id: string; properties: Record<string, unknown> } | null = null;
  if (targets.companyId) {
    const [row] = await db
      .select({ id: companies.id, properties: companies.properties })
      .from(companies)
      .where(and(eq(companies.id, targets.companyId), eq(companies.tenantId, authCtx.tenantId), isNull(companies.deletedAt)))
      .limit(1);
    companyRow = row ? { id: row.id, properties: (row.properties ?? {}) as Record<string, unknown> } : null;
  }

  let contactRow: { id: string; properties: Record<string, unknown> } | null = null;
  if (targets.contactId) {
    const [row] = await db
      .select({ id: contacts.id, properties: contacts.properties })
      .from(contacts)
      .where(and(eq(contacts.id, targets.contactId), eq(contacts.tenantId, authCtx.tenantId), isNull(contacts.deletedAt)))
      .limit(1);
    contactRow = row ? { id: row.id, properties: (row.properties ?? {}) as Record<string, unknown> } : null;
  }

  // Post-meeting coaching debrief — the row scoreInteraction wrote for THIS
  // meeting activity (orphaned until now). Newest post_interaction wins.
  const [coachingRow] = await db
    .select({
      score: coachingInsights.score,
      category: coachingInsights.category,
      summary: coachingInsights.summary,
      detail: coachingInsights.detail,
      suggestion: coachingInsights.suggestion,
      createdAt: coachingInsights.createdAt,
    })
    .from(coachingInsights)
    .where(and(
      eq(coachingInsights.tenantId, authCtx.tenantId),
      eq(coachingInsights.activityId, id),
      eq(coachingInsights.insightType, "post_interaction"),
    ))
    .orderBy(desc(coachingInsights.createdAt))
    .limit(1);

  return Response.json({
    meeting: {
      id: activity.id,
      title: activity.summary,
      date: meta.startTime || activity.occurredAt,
      endTime: meta.endTime,
      attendees: meta.attendees || [],
      location: meta.location,
      meetingLink: meta.meetingLink,
      // M3 — surface the underlying calendar provider so the UI can
      // label "From Microsoft Calendar" vs Google, instead of the old
      // hard-coded "google" fallback pretending every meeting came
      // from Gmail.
      calendarSource: meta.calendarSource || "unknown",
      // P0-4 follow-up — the recording URL surfaced by the Recall.ai
      // webhook (or manual paste). Consumed by the
      // <TranscriptVideoPlayer> on the meeting detail page so
      // citation chips can deep-link to the right offset.
      recordingUrl: typeof meta.recordingUrl === "string" ? meta.recordingUrl : null,
      recordingStatus: typeof meta.recordingStatus === "string" ? meta.recordingStatus : null,
    },
    hasTranscript: !!meta.hasTranscript || !!meta.structuredNotes,
    transcriptSource: meta.transcriptSource,
    notes: meta.structuredNotes || null,
    followUpDraft,
    followUpSentAt: meta.followUpSentAt || null,
    tasks: linkedTasks,
    matchedContacts: meta.matchedContacts || [],
    // Qualification + intel surfaced on the meeting record (Claap parity).
    crm: {
      deal: dealRow,
      company: companyRow,
      contact: contactRow,
    },
    coaching: coachingRow
      ? {
          score: coachingRow.score,
          category: coachingRow.category,
          summary: coachingRow.summary,
          detail: coachingRow.detail,
          suggestion: coachingRow.suggestion,
          createdAt: coachingRow.createdAt,
        }
      : null,
  });
}

/**
 * PATCH /api/meetings/:id/notes — M1. Update the structured notes
 * blob (summary, action items, decisions) OR the follow-up email draft
 * on an existing meeting activity. Partial updates are supported;
 * whichever keys the client sends get merged into
 * `activities.metadata`, the rest stay as-is.
 *
 * No LLM round-trip here — this is the straight "user saved their
 * edits" path. Re-generation goes through the post-call pipeline.
 */
const patchSchema = z.object({
  structuredNotes: z.unknown().optional(),
  followUpEmailDraft: z
    .object({
      subject: z.string().optional(),
      body: z.string().optional(),
    })
    .optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const [activity] = await db
    .select()
    .from(activities)
    .where(
      and(eq(activities.id, id), eq(activities.tenantId, authCtx.tenantId), isNull(activities.deletedAt))
    )
    .limit(1);

  if (!activity) {
    return Response.json({ error: "Meeting not found" }, { status: 404 });
  }

  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const currentMeta = (activity.metadata ?? {}) as Record<string, unknown>;
    const nextMeta: Record<string, unknown> = { ...currentMeta };
    if (parsed.data.structuredNotes !== undefined) {
      nextMeta.structuredNotes = parsed.data.structuredNotes;
    }
    if (parsed.data.followUpEmailDraft !== undefined) {
      const currentDraft = (currentMeta.followUpEmailDraft ?? {}) as Record<
        string,
        unknown
      >;
      nextMeta.followUpEmailDraft = {
        ...currentDraft,
        ...parsed.data.followUpEmailDraft,
      };
    }
    nextMeta.notesEditedAt = new Date().toISOString();

    await db
      .update(activities)
      .set({ metadata: nextMeta })
      .where(and(eq(activities.id, id), eq(activities.tenantId, authCtx.tenantId), isNull(activities.deletedAt)));

    return Response.json({ ok: true });
  } catch (err) {
    logger.error("meetings: notes PATCH failed", {
      err,
      meetingId: id,
      tenantId: authCtx.tenantId,
    });
    return Response.json(
      { error: "Failed to update notes. Please try again." },
      { status: 500 }
    );
  }
}
