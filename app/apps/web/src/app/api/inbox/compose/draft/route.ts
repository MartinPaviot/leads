import { getAuthContext } from "@/lib/auth/auth-utils";
import { z } from "zod";
import { draftFromBullets } from "@/lib/inbox/draft-from-bullets";

/**
 * POST /api/inbox/compose/draft  { bullets, context? }  (INBOX-C07)
 * Drafts an email (subject + body) from bullet points. Stateless + read-only;
 * the composer fills itself in client-side. Fail-closed: empty ⇒ no change.
 */
const bodySchema = z.object({
  bullets: z.string().min(1).max(8_000),
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

  try {
    const result = await draftFromBullets(parsed.bullets, parsed.context);
    return Response.json(result);
  } catch (error) {
    console.error("Failed to draft from bullets:", error);
    return Response.json({ error: "Failed to draft email" }, { status: 500 });
  }
}
