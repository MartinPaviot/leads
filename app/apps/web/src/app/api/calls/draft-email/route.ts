import { getAuthContext } from "@/lib/auth/auth-utils";
import { apiError } from "@/lib/infra/api-errors";
import { emailDraftingHandler } from "@/skills/outreach/email-drafting/handler";

/**
 * AI-draft a short email to a contact, for the "Write email" action in Call
 * Mode. Reuses the email-drafting skill (signal-anchored, prospect-context
 * aware) rather than reinventing the prompt. Default purpose is meeting_request
 * — the call sells the meeting, so the follow-up locks it.
 *
 * The draft is returned for review; nothing is sent here (the composer sends).
 */
export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return apiError("UNAUTHORIZED", "Authentication required");

  const body = (await req.json().catch(() => ({}))) as { contactId?: string; purpose?: string };
  const contactId = body.contactId?.trim();
  if (!contactId) return apiError("VALIDATION_ERROR", "contactId is required");

  const purpose = body.purpose === "follow_up" ? "follow_up" : "meeting_request";

  try {
    const draft = await emailDraftingHandler(
      {
        contactId,
        purpose,
        maxWords: 140,
        // Prospect-facing content adapts to the prospect's language (FR for a
        // francophone). Lock the 45-min discovery meeting with two concrete
        // time options; warm peer register, one real reason, no corporate filler.
        additionalContext:
          "Write in the prospect's own language (French if the prospect is francophone). Goal: lock a 45-minute discovery meeting — propose two concrete time options. Relaxed peer-to-peer tone, one genuine reason to meet, no corporate filler, no stacked techniques.",
      },
      { tenantId: authCtx.tenantId, dryRun: false },
    );
    return Response.json({ subject: draft.subject, body: draft.body, signalUsed: draft.signalUsed });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Failed to draft the email" },
      { status: 500 },
    );
  }
}
