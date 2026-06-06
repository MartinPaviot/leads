import { getAuthContext } from "@/lib/auth/auth-utils";
import { checkRateLimit } from "@/lib/infra/rate-limit";
import { processPostCall } from "@/lib/meetings/post-call";

/**
 * Manual "Confirm & update CRM" trigger. The actual pipeline (tasks from action
 * items, deal/account intel update, follow-up DRAFT) lives in
 * lib/meetings/post-call.ts so the Recall webhook can run the exact same thing
 * automatically on call-end. Idempotent via meta.postCallProcessedAt.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rlResponse = await checkRateLimit("llm", authCtx.userId);
  if (rlResponse) return rlResponse;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const result = await processPostCall({
    activityId: id,
    tenantId: authCtx.tenantId,
    userId: authCtx.appUserId,
    createTasks: body.createTasks,
    generateFollowUp: body.generateFollowUp,
    updateDeal: body.updateDeal,
    dealId: body.dealId,
    force: body.force,
  });

  if (result.notFound) {
    return Response.json({ error: "Meeting not found" }, { status: 404 });
  }
  if (result.noNotes) {
    return Response.json({ error: "No processed notes for this meeting" }, { status: 400 });
  }

  return Response.json({
    success: result.success,
    alreadyProcessed: result.alreadyProcessed,
    tasks: result.tasks,
    followUpDraft: result.followUpDraft,
    dealUpdated: result.dealUpdated,
  });
}
