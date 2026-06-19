import { getAuthContext } from "@/lib/auth/auth-utils";
import {
  getAutonomySettings,
  saveAutonomySettings,
  AUTONOMY_CATALOG,
  type AutonomySettings,
} from "@/lib/inbox/autonomy-hub";

/**
 * GET / PUT /api/inbox/autonomy  (INBOX-T11 / O06)
 *
 * The viewer's per-feature autonomy dial (off / suggest / auto), owner-scoped
 * (user_preferences JSONB, no migration). Saved values are clamped to each
 * feature's ceiling — outward-writing features (draft, send) can never be set to
 * "auto", preserving the never-auto-send contract.
 */
export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const settings = await getAutonomySettings(authCtx.userId);
  return Response.json({ catalog: AUTONOMY_CATALOG, settings });
}

export async function PUT(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: { settings?: AutonomySettings };
  try {
    body = (await req.json()) as { settings?: AutonomySettings };
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const settings = await saveAutonomySettings(
    authCtx.userId,
    body.settings && typeof body.settings === "object" ? body.settings : {},
  );
  return Response.json({ catalog: AUTONOMY_CATALOG, settings });
}
