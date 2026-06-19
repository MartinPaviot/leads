import { getAuthContext } from "@/lib/auth/auth-utils";
import { getAutoDraft, saveAutoDraft, type AutoDraftPrefs } from "@/lib/inbox/auto-draft-prefs";

/**
 * GET / PUT /api/inbox/auto-draft  (B1)
 *
 * The viewer's "pre-draft replies on thread open" preference, owner-scoped
 * (user_preferences JSONB, no migration), default OFF. The pane reads this to
 * decide whether a reply-worthy thread pre-drafts automatically on open (R4.2);
 * it NEVER overrides selectivity (non-reply-worthy threads never auto-draft, R4.4).
 */
export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const autoDraft = await getAutoDraft(authCtx.userId);
  return Response.json({ autoDraft });
}

export async function PUT(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: Partial<AutoDraftPrefs>;
  try {
    body = (await req.json()) as Partial<AutoDraftPrefs>;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const autoDraft = await saveAutoDraft(authCtx.userId, body?.enabled === true);
  return Response.json({ autoDraft });
}
