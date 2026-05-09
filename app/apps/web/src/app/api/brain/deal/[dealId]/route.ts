/**
 * GET /api/brain/deal/[dealId] — Phase 4 endpoint.
 *
 * Returns the focal deal's brain : focalDeal + primary contact +
 * deal activities + surrounding company brain. Tenant scope is
 * enforced server-side via getAuthContext.
 *
 * Query params (all optional) :
 *   ?dealActivities=N      cap on deal activities (default 50)
 *   ?recentActivities=N    forwarded to companyBrain (default 50)
 *   ?contacts=N            forwarded to companyBrain (default 50)
 *   ?memories=N            forwarded to companyBrain (default 25)
 */

import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { getDealBrain } from "@/lib/company-brain/get-deal-brain";

function parseIntCap(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1 || n > 500) return fallback;
  return n;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ dealId: string }> },
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { dealId } = await params;
  if (!dealId) {
    return NextResponse.json({ error: "Missing dealId" }, { status: 400 });
  }

  const url = new URL(req.url);
  const dealActivityCap = parseIntCap(
    url.searchParams.get("dealActivities"),
    50,
  );
  const recentActivityCap = parseIntCap(
    url.searchParams.get("recentActivities"),
    50,
  );
  const contactCap = parseIntCap(url.searchParams.get("contacts"), 50);
  const memoryCap = parseIntCap(url.searchParams.get("memories"), 25);

  try {
    const brain = await getDealBrain(dealId, {
      tenantId: authCtx.tenantId,
      dealActivityCap,
      recentActivityCap,
      contactCap,
      memoryCap,
    });
    if (!brain) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }
    return NextResponse.json(brain);
  } catch (err) {
    console.error("[GET /api/brain/deal]", err);
    return NextResponse.json(
      { error: "Failed to assemble deal brain" },
      { status: 500 },
    );
  }
}
