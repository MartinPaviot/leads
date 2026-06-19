import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { and, eq, ilike } from "drizzle-orm";
import { getWritingStyle, selectAudience } from "@/lib/inbox/writing-style";

/**
 * POST /api/inbox/writing-style/audience-preview  { email }  (B2 R4.5)
 *
 * Given a test recipient, return WHICH audience the draft engine would resolve
 * (so the user can verify routing without sending mail). Looks the contact up by
 * email for title/tags (best-effort), then runs the pure selectAudience over the
 * saved style. Read-only.
 */
export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let email = "";
  try {
    email = String(((await req.json()) as { email?: unknown }).email || "").trim();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let title: string | null = null;
  let tags: string[] = [];
  if (email) {
    const [c] = await db
      .select({ title: contacts.title, properties: contacts.properties })
      .from(contacts)
      .where(and(eq(contacts.tenantId, authCtx.tenantId), ilike(contacts.email, email)))
      .limit(1);
    if (c) {
      title = c.title ?? null;
      const props = c.properties && typeof c.properties === "object" ? (c.properties as Record<string, unknown>) : {};
      if (Array.isArray(props.tags)) tags = props.tags.filter((x): x is string => typeof x === "string");
    }
  }

  const style = await getWritingStyle(authCtx.userId);
  const audience = selectAudience(style, { email, title, tags });
  return Response.json({ audience: audience ? { id: audience.id, label: audience.label } : null });
}
