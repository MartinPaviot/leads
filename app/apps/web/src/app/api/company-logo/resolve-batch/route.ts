import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { resolveCompanyLogoBatch } from "@/lib/logo/resolver";

const MAX_BATCH_SIZE = 50;

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await rateLimit(`logo-resolve:${authCtx.tenantId}`, 120, 60_000);
  if (!rl.success) return rateLimitResponse(rl.resetAt);

  let body: { entries?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!Array.isArray(body.entries) || body.entries.length === 0) {
    return NextResponse.json(
      { error: "entries must be a non-empty array" },
      { status: 400 },
    );
  }

  if (body.entries.length > MAX_BATCH_SIZE) {
    return NextResponse.json(
      { error: `Batch size exceeds maximum of ${MAX_BATCH_SIZE}` },
      { status: 400 },
    );
  }

  const requests = body.entries.map(
    (e: { domain?: string; companyName?: string }) => ({
      domain: typeof e.domain === "string" ? e.domain : null,
      companyName: typeof e.companyName === "string" ? e.companyName : "",
      tenantId: authCtx.tenantId,
    }),
  );

  const results = await resolveCompanyLogoBatch(requests);

  return NextResponse.json({ results });
}
