/**
 * GET /api/brain/[companyId]
 *
 * Phase 1 read endpoint for the Company Brain. Returns the full
 * unified view of a company in one request, joining 8+ tables
 * server-side so the chat panel / meeting prep / founder briefing
 * don't have to compose ad-hoc queries.
 *
 * Multi-tenant safe : the tenantId comes from `getAuthContext()` ;
 * the caller never supplies it. Cross-tenant access returns 404.
 *
 * Query params (all optional) :
 *   ?recentActivities=N    cap on activities (default 50)
 *   ?contacts=N            cap on contacts (default 50)
 *   ?memories=N            cap on memories (default 25)
 *
 * No transcript-query support yet — Phase 1 keeps this read fully
 * deterministic + cheap. Semantic transcript retrieval is wired
 * via the chat tool already, and Phase 3 will add it here when the
 * brain UI surfaces it.
 */

import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { getCompanyBrain } from "@/lib/company-brain/get-brain";

function parseIntCap(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1 || n > 500) return fallback;
  return n;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { companyId } = await params;
  if (!companyId) {
    return NextResponse.json({ error: "Missing companyId" }, { status: 400 });
  }

  const url = new URL(req.url);
  const recentActivityCap = parseIntCap(
    url.searchParams.get("recentActivities"),
    50,
  );
  const contactCap = parseIntCap(url.searchParams.get("contacts"), 50);
  const memoryCap = parseIntCap(url.searchParams.get("memories"), 25);

  try {
    const brain = await getCompanyBrain(companyId, {
      tenantId: authCtx.tenantId,
      recentActivityCap,
      contactCap,
      memoryCap,
    });
    if (!brain) {
      return NextResponse.json(
        { error: "Company not found" },
        { status: 404 },
      );
    }
    return NextResponse.json(brain);
  } catch (err) {
    console.error("[GET /api/brain]", err);
    return NextResponse.json(
      { error: "Failed to assemble brain" },
      { status: 500 },
    );
  }
}
