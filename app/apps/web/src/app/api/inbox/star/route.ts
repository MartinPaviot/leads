import { getAuthContext } from "@/lib/auth/auth-utils";
import { toggleStarred } from "@/lib/inbox/starred-store";
import { z } from "zod";

/**
 * POST /api/inbox/star  { key, starred? }  (shell-redesign, Upstream is:starred)
 *
 * Toggle a conversation's star (or set it explicitly via `starred`). Owner-scoped
 * in user_preferences (no migration). Returns the new starred state.
 */
const schema = z.object({
  key: z.string().trim().min(1),
  starred: z.boolean().optional(),
});

export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await req.json());
  } catch {
    return Response.json({ error: "Invalid body" }, { status: 422 });
  }

  try {
    const starred = await toggleStarred(ctx.userId, body.key, body.starred);
    return Response.json({ starred });
  } catch (err) {
    console.error("Failed to toggle star:", err);
    return Response.json({ error: "Failed to toggle star" }, { status: 500 });
  }
}
