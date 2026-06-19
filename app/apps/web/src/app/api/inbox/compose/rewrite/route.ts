import { getAuthContext } from "@/lib/auth/auth-utils";
import { z } from "zod";
import { rewrite } from "@/lib/inbox/rewrite";

/**
 * POST /api/inbox/compose/rewrite  { body, instruction }  (INBOX-C04)
 * Returns a rewritten email body. Stateless + read-only (nothing is sent or
 * stored) — the composer swaps it in client-side with an undo. Fail-closed:
 * an empty result means the caller keeps the original.
 */
const bodySchema = z.object({
  body: z.string().min(1).max(20_000),
  instruction: z.string().min(1).max(500),
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
    const { text } = await rewrite(parsed.body, parsed.instruction);
    return Response.json({ text });
  } catch (error) {
    console.error("Failed to rewrite email:", error);
    return Response.json({ error: "Failed to rewrite email" }, { status: 500 });
  }
}
