/**
 * GET /api/brain/contact/[contactId] — Phase 4 endpoint.
 *
 * Returns the focal contact's brain : focalContact + direct
 * activities + owned deals + surrounding company brain. Tenant
 * scope is enforced server-side via getAuthContext.
 *
 * Query params (all optional) :
 *   ?directActivities=N    cap on direct activities (default 50)
 *   ?recentActivities=N    forwarded to companyBrain (default 50)
 *   ?contacts=N            forwarded to companyBrain (default 50)
 *   ?memories=N            forwarded to companyBrain (default 25)
 */

import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { getContactBrain } from "@/lib/company-brain/get-contact-brain";

function parseIntCap(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1 || n > 500) return fallback;
  return n;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ contactId: string }> },
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { contactId } = await params;
  if (!contactId) {
    return NextResponse.json({ error: "Missing contactId" }, { status: 400 });
  }

  const url = new URL(req.url);
  const directActivityCap = parseIntCap(
    url.searchParams.get("directActivities"),
    50,
  );
  const recentActivityCap = parseIntCap(
    url.searchParams.get("recentActivities"),
    50,
  );
  const contactCap = parseIntCap(url.searchParams.get("contacts"), 50);
  const memoryCap = parseIntCap(url.searchParams.get("memories"), 25);

  try {
    const brain = await getContactBrain(contactId, {
      tenantId: authCtx.tenantId,
      directActivityCap,
      recentActivityCap,
      contactCap,
      memoryCap,
    });
    if (!brain) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }
    return NextResponse.json(brain);
  } catch (err) {
    console.error("[GET /api/brain/contact]", err);
    return NextResponse.json(
      { error: "Failed to assemble contact brain" },
      { status: 500 },
    );
  }
}
