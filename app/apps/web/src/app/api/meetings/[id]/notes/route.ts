import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { activities, tasks } from "@/db/schema";
import { eq, and, inArray, isNull } from "drizzle-orm";
import { logger } from "@/lib/observability/logger";
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
