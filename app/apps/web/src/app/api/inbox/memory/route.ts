import { getAuthContext } from "@/lib/auth/auth-utils";
import { getInboxMemory, saveInboxMemory, type InboxMemory } from "@/lib/inbox/ai-memory";

/**
 * GET / PUT /api/inbox/memory  (INBOX-O02)
 *
 * The viewer's standing instructions + "about me" facts, owner-scoped
 * (user_preferences JSONB, no migration). Saved values are clamped (caps,
 * blanks dropped); auto-send-style instructions are never honored downstream by
 * buildMemoryPrompt — drafts stay approval-gated.
 */
export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const memory = await getInboxMemory(authCtx.userId);
  return Response.json({ memory });
}

export async function PUT(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: Partial<InboxMemory>;
  try {
    body = (await req.json()) as Partial<InboxMemory>;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const memory = await saveInboxMemory(authCtx.userId, {
    standingInstructions: Array.isArray(body.standingInstructions) ? body.standingInstructions : [],
    aboutMe: body.aboutMe && typeof body.aboutMe === "object" ? body.aboutMe : {},
  });
  return Response.json({ memory });
}
