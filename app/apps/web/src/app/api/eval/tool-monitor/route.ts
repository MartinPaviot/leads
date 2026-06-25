import { NextResponse } from "next/server";
import { withAuthRLS, requireAdmin } from "@/lib/auth/auth-utils";
import { runToolSelectionAudit } from "@/lib/observability/tool-selection-monitor";

export async function GET(req: Request) {
  return withAuthRLS(async (authCtx) => {
    // Admin-only — eval/observability internals (matches the other eval/* GETs).
    const adminCheck = requireAdmin(authCtx);
    if (adminCheck) return adminCheck;
    const { searchParams } = new URL(req.url);
    const days = parseInt(searchParams.get("days") || "7", 10);

    const report = await runToolSelectionAudit(authCtx.tenantId, days);

    return NextResponse.json(report);
  });
}
