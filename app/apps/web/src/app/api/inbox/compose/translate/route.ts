import { getAuthContext } from "@/lib/auth/auth-utils";
import { z } from "zod";
import { translate } from "@/lib/inbox/translate";

/**
 * POST /api/inbox/compose/translate  { body, targetLang }  (INBOX-C08)
 * Translates the composer body. Stateless + read-only; the composer swaps it in
 * with an undo. Fail-closed: empty ⇒ caller keeps the original.
 */
const bodySchema = z.object({
  body: z.string().min(1).max(20_000),
  targetLang: z.string().min(1).max(40),
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
    const { text } = await translate(parsed.body, parsed.targetLang);
    return Response.json({ text });
  } catch (error) {
    console.error("Failed to translate email:", error);
    return Response.json({ error: "Failed to translate email" }, { status: 500 });
  }
}
