import { getAuthContext } from "@/lib/auth/auth-utils";
import { listSnippets, saveSnippets } from "@/lib/inbox/snippet-store";
import { normalizeSnippets } from "@/lib/inbox/snippets";

/**
 * GET /api/inbox/snippets — the user's personal reply snippets (INBOX-X05).
 * PUT /api/inbox/snippets { snippets } — replace the whole set. Owner-scoped.
 */
export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json({ snippets: await listSnippets(authCtx.userId) });
  } catch (error) {
    console.error("Failed to load snippets:", error);
    return Response.json({ snippets: [] });
  }
}

export async function PUT(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = (await req.json().catch(() => ({}))) as { snippets?: unknown };
    const clean = normalizeSnippets(body.snippets);
    return Response.json({ ok: true, snippets: await saveSnippets(authCtx.userId, clean) });
  } catch (error) {
    console.error("Failed to save snippets:", error);
    return Response.json({ error: "Failed to save snippets" }, { status: 500 });
  }
}
