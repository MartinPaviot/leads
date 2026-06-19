import { getAuthContext } from "@/lib/auth/auth-utils";
import { z } from "zod";
import { fixGrammar } from "@/lib/inbox/grammar-fix";
import { getAiProfile, aiEnabled } from "@/lib/inbox/ai-profile";

/**
 * POST /api/inbox/compose/grammar  { text }  (INBOX-C12)
 *
 * Returns the message with grammar / spelling / punctuation fixed (meaning and
 * voice preserved) + a `corrected` flag. Stateless + read-only; gated on the AI
 * profile (P03; off ⇒ unchanged). Fail-closed: the original text is returned on
 * any error, so the composer never loses what the user typed.
 */
const bodySchema = z.object({ text: z.string().min(1).max(8_000) });

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
    return Response.json({ text: parsed.text, corrected: false });
  }

  try {
    const result = await fixGrammar(parsed.text);
    return Response.json(result);
  } catch (error) {
    console.error("Failed to fix grammar:", error);
    return Response.json({ text: parsed.text, corrected: false });
  }
}
