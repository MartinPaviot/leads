/**
 * GET /api/sending-mode — whether the outbound test-mode guardrail is on,
 * and the effective allowlist. Drives the honest "test mode" banner on the
 * Campaigns page so the user knows real prospects aren't being contacted.
 */
import { getAuthContext } from "@/lib/auth/auth-utils";
import { isOutboundTestMode, outboundAllowlist } from "@/lib/emails/recipient-guardrail";

export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const testMode = isOutboundTestMode();
  return Response.json({
    testMode,
    allowlist: testMode ? outboundAllowlist() : [],
  });
}
