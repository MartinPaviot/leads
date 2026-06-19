import { getAuthContext } from "@/lib/auth/auth-utils";
import { getTrustedImageSenders, addTrustedImageSender } from "@/lib/inbox/image-trust-store";

/**
 * GET  /api/inbox/image-trust — the user's "always show images" sender allowlist.
 * POST /api/inbox/image-trust { sender } — trust a sender (INBOX-R02). Owner-scoped.
 */
export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json({ senders: await getTrustedImageSenders(authCtx.userId) });
  } catch (error) {
    console.error("Failed to load trusted image senders:", error);
    return Response.json({ senders: [] });
  }
}

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = (await req.json().catch(() => ({}))) as { sender?: string };
    if (!body.sender) return Response.json({ error: "Missing sender" }, { status: 400 });
    return Response.json({ ok: true, senders: await addTrustedImageSender(authCtx.userId, body.sender) });
  } catch (error) {
    console.error("Failed to add trusted image sender:", error);
    return Response.json({ error: "Failed to update trusted senders" }, { status: 500 });
  }
}
