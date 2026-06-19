import { getAuthContext } from "@/lib/auth/auth-utils";
import { getInboxScope } from "@/lib/inbox/user-scope";
import { getMailboxIdentities, saveMailboxIdentity } from "@/lib/inbox/mailbox-identity";
import { z } from "zod";

/**
 * GET / PATCH /api/inbox/mailbox-identity  (A3)
 *
 * The viewer's per-mailbox identity overrides (display-name / signature / voice),
 * owner-scoped in user_preferences (no migration). GET returns the whole map;
 * PATCH saves one mailbox's identity — but only for a mailbox INSIDE the viewer's
 * inbox scope (a forged/cross-tenant id is rejected, never widening the scope).
 */
export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({ identities: await getMailboxIdentities(ctx.userId) });
}

const patchSchema = z.object({
  mailboxId: z.string().min(1),
  displayName: z.string().optional(),
  signature: z.string().optional(),
  voice: z.string().optional(),
});

export async function PATCH(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await req.json());
  } catch {
    return Response.json({ error: "Invalid body" }, { status: 422 });
  }

  const scope = await getInboxScope(ctx.tenantId, ctx.userId);
  if (!scope.mailboxIds.has(body.mailboxId)) {
    return Response.json({ error: "Mailbox not found" }, { status: 404 });
  }

  const identity = await saveMailboxIdentity(ctx.userId, body.mailboxId, {
    displayName: body.displayName,
    signature: body.signature,
    voice: body.voice,
  });
  return Response.json({ identity });
}
