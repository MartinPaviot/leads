import { getAuthContext } from "@/lib/auth/auth-utils";
import {
  getAiProfile,
  saveAiProfile,
  normalizeProfile,
  AI_PROFILE_OPTIONS,
} from "@/lib/inbox/ai-profile";

/**
 * GET / PUT /api/inbox/ai-profile  (INBOX-P03)
 *
 * The viewer's AI data-handling profile (standard / zero_retention / off),
 * owner-scoped (user_preferences JSONB, no migration). Inbox AI endpoints gate
 * on this — "off" disables them fail-closed.
 */
export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const profile = await getAiProfile(authCtx.userId);
  return Response.json({ options: AI_PROFILE_OPTIONS, profile });
}

export async function PUT(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: { profile?: unknown };
  try {
    body = (await req.json()) as { profile?: unknown };
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const profile = await saveAiProfile(authCtx.userId, normalizeProfile(body.profile));
  return Response.json({ options: AI_PROFILE_OPTIONS, profile });
}
