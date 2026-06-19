import { getAuthContext } from "@/lib/auth/auth-utils";
import { z } from "zod";
import { draftSchedulingEmail } from "@/lib/inbox/scheduling-draft";
import { getAiProfile, aiEnabled } from "@/lib/inbox/ai-profile";

/**
 * POST /api/inbox/compose/scheduling  { slots[], context? }  (INBOX-C10)
 *
 * Drafts a short email proposing the given time slots. Stateless + read-only;
 * the composer fills itself in client-side. Gated on the AI profile (P03) — "off"
 * returns empty. Fail-closed: empty ⇒ no change. (Auto-fetching the slots from
 * the connected calendar is the residual; the caller supplies them here.)
 */
const bodySchema = z.object({
  slots: z.array(z.string()).min(1).max(8),
  context: z.string().max(2_000).optional(),
});

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json({ error: err.issues[0]?.message || "Validation failed" }, { status: 422 });
    }
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!aiEnabled(await getAiProfile(authCtx.userId))) {
    return Response.json({ subject: "", text: "" });
  }

  try {
    const result = await draftSchedulingEmail(parsed.slots, parsed.context);
    return Response.json(result);
  } catch (error) {
    console.error("Failed to draft scheduling email:", error);
    return Response.json({ error: "Failed to draft scheduling email" }, { status: 500 });
  }
}
